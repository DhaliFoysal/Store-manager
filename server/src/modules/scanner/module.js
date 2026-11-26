import { Router } from 'express';
import os from 'node:os';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { asyncHandler, validate } from '../../core/http.js';
import { authenticate, requireAnyPermission, requireStore } from '../../core/auth.js';
import { AppError, unauthorized } from '../../core/errors.js';
import { closeSession, createSession, emit, getSession, newScanId, safeEqual, touchPhone } from './sessions.js';

/**
 * Wireless scanner: phone (camera) ──POST scan──▶ API ──Server-Sent Events──▶ the PC's browser.
 *
 *   PC  (signed in)      POST   /api/scanner/sessions            create a pairing session  → QR code
 *   PC  (stream token)   GET    /api/scanner/sessions/:id/stream  live scan feed (SSE)
 *   PC  (signed in)      DELETE /api/scanner/sessions/:id         unpair
 *   Phone (phone token)  POST   /api/scanner/sessions/:id/hello   "I'm connected" + heartbeat
 *   Phone (phone token)  POST   /api/scanner/sessions/:id/scan    send one scanned code
 *
 * The phone never needs to sign in: its token (inside the QR code) can only send scans to that one session.
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

// LAN addresses of the machine running the API – the phone needs one of these, not "localhost"
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
    const s = createSession({ storeId: req.user.storeId, userId: req.user.id });
    res.status(201).json({ id: s.id, phoneToken: s.phoneToken, streamToken: s.streamToken, expiresAt: s.expiresAt });
  }),
);

router.delete('/sessions/:id', ...pcGuard, (req, res) => {
  const s = getSession(req.params.id);
  if (s && s.userId === req.user.id) closeSession(s.id);
  res.status(204).end();
});

// EventSource cannot send an Authorization header, so the PC proves itself with its stream token
router.get('/sessions/:id/stream', (req, res, next) => {
  const s = getSession(req.params.id);
  if (!s || !safeEqual(req.query.token, s.streamToken)) return next(unauthorized('Scanner session not found or expired'));

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // nginx: don't buffer the stream
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  res.write(`event: state\ndata: ${JSON.stringify({ phoneOnline: s.phoneOnline })}\n\n`);

  s.listeners.add(res);
  req.on('close', () => s.listeners.delete(res));
});

function phoneSession(req) {
  const s = getSession(req.params.id);
  if (!s || !safeEqual(req.body?.token, s.phoneToken)) throw unauthorized('This scanner link is invalid or has expired — scan the QR code again');
  return s;
}

const tokenBody = z.object({ token: z.string().min(10).max(100) });

router.post(
  '/sessions/:id/hello',
  phoneLimiter,
  validate({ body: tokenBody }),
  asyncHandler(async (req, res) => {
    const s = phoneSession(req);
    touchPhone(s);
    res.json({ ok: true, pcListening: s.listeners.size > 0 });
  }),
);

// What does this code correspond to in the store? (shown on the phone and on the PC)
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
    const s = phoneSession(req);
    touchPhone(s);
    if (s.listeners.size === 0) {
      // the PC page is closed / disconnected – tell the phone instead of silently dropping the scan
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
  scope: 'public', // the phone endpoints are token-based; PC endpoints opt in to authenticate above
  permissions: [],
  router,
};
