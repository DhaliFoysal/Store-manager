import { Router } from 'express';
import os from 'node:os';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../core/db.js';
import { asyncHandler, validate } from '../../core/http.js';
import { authenticate, requireAnyPermission, requireStore } from '../../core/auth.js';
import { AppError, unauthorized } from '../../core/errors.js';
import { closeSession, ensureSession, emit, getSession, newScanId, rand, safeEqual, touchPhone } from './sessions.js';

/**
 * Wireless scanner with a PERMANENT pairing per user:
 *   PC  (signed in)      POST /api/scanner/sessions          get (or create once) the user's pairing -> same QR/link every time
 *   PC  (signed in)      POST /api/scanner/sessions/renew    revoke the old link and make a new one
 *   PC  (stream token)   GET  /api/scanner/sessions/:id/stream
 *   Phone (phone token)  POST /api/scanner/sessions/:id/hello | /scan
 */
const router = Router();
const pcGuard = [authenticate, requireStore, requireAnyPermission('sales.create', 'inventory.view', 'inventory.manage', 'products.manage')];

const phoneLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `scan:${req.params.id}`,
  message: { message: 'Too many scans, slow down' },
});

const isPrivate = (ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
const newTokens = () => ({ code: rand(9), phoneToken: rand(24), streamToken: rand(24) });
const FAR_FUTURE = () => Date.now() + 365 * 24 * 3600 * 1000;

async function getOrCreatePairing(userId) {
  const found = await prisma.scannerPairing.findUnique({ where: { userId } });
  if (found) return found;
  try {
    return await prisma.scannerPairing.create({ data: { userId, ...newTokens() } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return prisma.scannerPairing.findUnique({ where: { userId } }); // created by a parallel request
    }
    throw e;
  }
}

const open = (p, user) => {
  ensureSession({ code: p.code, storeId: user.storeId, userId: user.id, phoneToken: p.phoneToken, streamToken: p.streamToken });
  return { id: p.code, phoneToken: p.phoneToken, streamToken: p.streamToken, expiresAt: FAR_FUTURE() };
};

// live session from memory, or rebuilt from the DB (e.g. after a server restart)
async function resolve(id) {
  const live = getSession(id);
  if (live) return live;
  const p = await prisma.scannerPairing.findUnique({
    where: { code: String(id) },
    include: { user: { select: { id: true, storeId: true, status: true } } },
  });
  if (!p || p.user.status !== 'ACTIVE' || !p.user.storeId) return null;
  return ensureSession({ code: p.code, storeId: p.user.storeId, userId: p.user.id, phoneToken: p.phoneToken, streamToken: p.streamToken });
}

router.get('/network', ...pcGuard, (req, res) => {
  const addresses = Object.entries(os.networkInterfaces())
    .flatMap(([name, list]) => (list || []).map((i) => ({ name, ...i })))
    .filter((i) => i.family === 'IPv4' && !i.internal)
    .map((i) => ({ name: i.name, address: i.address, private: isPrivate(i.address) }))
    .sort((a, b) => Number(b.private) - Number(a.private));
  res.json({ addresses });
});

router.post(
  '/sessions',
  ...pcGuard,
  asyncHandler(async (req, res) => {
    const p = await getOrCreatePairing(req.user.id);
    res.status(201).json(open(p, req.user));
  }),
);

router.post(
  '/sessions/renew',
  ...pcGuard,
  asyncHandler(async (req, res) => {
    const old = await prisma.scannerPairing.findUnique({ where: { userId: req.user.id } });
    if (old) closeSession(old.code);
    const t = newTokens();
    const p = await prisma.scannerPairing.upsert({ where: { userId: req.user.id }, update: t, create: { userId: req.user.id, ...t } });
    res.status(201).json(open(p, req.user));
  }),
);

// EventSource cannot send an Authorization header, so the PC proves itself with its stream token
router.get(
  '/sessions/:id/stream',
  asyncHandler(async (req, res) => {
    const s = await resolve(req.params.id);
    if (!s || !safeEqual(req.query.token, s.streamToken)) throw unauthorized('Scanner session not found or expired');

    res.set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    res.write(`event: state\ndata: ${JSON.stringify({ phoneOnline: s.phoneOnline })}\n\n`);

    s.listeners.add(res);
    req.on('close', () => s.listeners.delete(res));
  }),
);

async function phoneSession(req) {
  const s = await resolve(req.params.id);
  if (!s || !safeEqual(req.body?.token, s.phoneToken)) throw unauthorized('This scanner link is invalid or has expired — scan the QR code again');
  return s;
}

const tokenBody = z.object({ token: z.string().min(10).max(100) });

router.post(
  '/sessions/:id/hello',
  phoneLimiter,
  validate({ body: tokenBody }),
  asyncHandler(async (req, res) => {
    const s = await phoneSession(req);
    touchPhone(s);
    res.json({ ok: true, pcListening: s.listeners.size > 0 });
  }),
);

async function describe(storeId, code) {
  const unit = await prisma.productUnit.findFirst({
    where: { storeId, serialNumber: code },
    select: { status: true, product: { select: { name: true } } },
  });
  if (unit) return { type: 'serial', name: unit.product.name, status: unit.status };
  const product = await prisma.product.findFirst({
    where: { storeId, OR: [{ barcode: code }, { sku: code }] },
    select: { name: true },
  });
  return product ? { type: 'product', name: product.name } : null;
}

router.post(
  '/sessions/:id/scan',
  phoneLimiter,
  validate({
    body: tokenBody.extend({
      code: z.string().trim().min(1).max(120),
      source: z.enum(['camera', 'manual']).default('camera'),
    }),
  }),
  asyncHandler(async (req, res) => {
    const s = await phoneSession(req);
    touchPhone(s);
    if (s.listeners.size === 0) {
      throw new AppError(409, 'The computer is not listening. Open the app on the PC and keep it connected.');
    }
    const match = await describe(s.storeId, req.body.code).catch(() => null);
    const event = { id: newScanId(), code: req.body.code, source: req.body.source, ts: Date.now(), match };
    emit(s, 'scan', event);
    res.json({ ok: true, match });
  }),
);

export default {
  name: 'scanner',
  label: 'Scanner',
  path: 'scanner',
  scope: 'public', // phone endpoints are token-based; PC endpoints opt in to authenticate above
  permissions: [],
  router,
};
