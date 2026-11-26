import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { asyncHandler, validate, idParam, pageQuery, pageArgs, pageMeta, optStr } from '../../core/http.js';
import { requirePermission } from '../../core/auth.js';
import { AppError, notFound } from '../../core/errors.js';
import { nextNumber } from '../../core/numbering.js';

const router = Router();
const DAY = 86_400_000;
const CLOSED = ['RETURNED', 'REPLACED', 'REJECTED'];

const itemInclude = {
  sale: { select: { id: true, voucherNo: true, createdAt: true, status: true, customer: { select: { id: true, name: true, phone: true } } } },
  claims: { select: { id: true, ticketNo: true, status: true }, orderBy: { id: 'desc' } },
};

const warrantyState = (end) => {
  if (!end) return 'none';
  const now = Date.now();
  if (end.getTime() < now) return 'expired';
  return end.getTime() - now <= 30 * DAY ? 'expiring' : 'active';
};
const withState = (item) => ({ ...item, state: warrantyState(item.warrantyEnd) });

// Every sold item that carries a warranty (the "tracking" list)
router.get(
  '/items',
  requirePermission('warranty.view'),
  validate({
    query: pageQuery.extend({
      q: optStr,
      state: z.preprocess((v) => v || 'all', z.enum(['all', 'active', 'expiring', 'expired'])),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { q, state, page, limit } = req.query;
    const now = new Date();
    const range =
      state === 'active' ? { gte: now }
      : state === 'expiring' ? { gte: now, lte: new Date(now.getTime() + 30 * DAY) }
      : state === 'expired' ? { lt: now }
      : { not: null };

    const where = {
      warrantyEnd: range,
      sale: { storeId: req.user.storeId, status: { not: 'VOID' } },
      ...(q
        ? {
            OR: [
              { serialNumber: { contains: q } },
              { productName: { contains: q } },
              { sale: { voucherNo: { contains: q } } },
              { sale: { customer: { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.saleItem.count({ where }),
      prisma.saleItem.findMany({ where, include: itemInclude, orderBy: { warrantyEnd: 'asc' }, ...pageArgs({ page, limit }) }),
    ]);
    res.json({ data: rows.map(withState), meta: pageMeta(page, limit, total) });
  }),
);

// Quick check by exact serial number
router.get(
  '/lookup',
  requirePermission('warranty.view'),
  validate({ query: z.object({ serial: z.string().trim().min(1).max(120) }) }),
  asyncHandler(async (req, res) => {
    const item = await prisma.saleItem.findFirst({
      where: { serialNumber: req.query.serial, sale: { storeId: req.user.storeId } },
      include: itemInclude,
    });
    if (!item) throw notFound('No sold item found with that serial number');
    res.json(withState(item));
  }),
);

const claimInclude = {
  saleItem: {
    select: {
      id: true, productName: true, sku: true, serialNumber: true, warrantyEnd: true,
      sale: { select: { id: true, voucherNo: true, customer: { select: { id: true, name: true, phone: true } } } },
    },
  },
  createdBy: { select: { name: true } },
};

router.get(
  '/claims',
  requirePermission('warranty.view'),
  validate({
    query: pageQuery.extend({
      q: optStr,
      status: z.preprocess((v) => v || undefined, z.enum(['OPEN', 'CLOSED', 'RECEIVED', 'IN_REPAIR', 'REPAIRED', 'REPLACED', 'REJECTED', 'RETURNED']).optional()),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { q, status, page, limit } = req.query;
    const where = {
      storeId: req.user.storeId,
      ...(status === 'OPEN' ? { status: { notIn: CLOSED } } : status === 'CLOSED' ? { status: { in: CLOSED } } : status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { ticketNo: { contains: q } },
              { saleItem: { serialNumber: { contains: q } } },
              { saleItem: { productName: { contains: q } } },
              { saleItem: { sale: { voucherNo: { contains: q } } } },
              { saleItem: { sale: { customer: { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.warrantyClaim.count({ where }),
      prisma.warrantyClaim.findMany({ where, include: claimInclude, orderBy: { receivedAt: 'desc' }, ...pageArgs({ page, limit }) }),
    ]);
    res.json({ data: rows, meta: pageMeta(page, limit, total) });
  }),
);

router.post(
  '/claims',
  requirePermission('warranty.manage'),
  validate({
    body: z.object({
      saleItemId: z.coerce.number().int().positive(),
      issue: z.string().trim().min(3, 'Describe the problem').max(2000),
      acknowledgeOutOfWarranty: z.boolean().default(false),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { storeId, id: userId } = req.user;
    const { saleItemId, issue, acknowledgeOutOfWarranty } = req.body;

    const claim = await prisma.$transaction(async (tx) => {
      const item = await tx.saleItem.findFirst({ where: { id: saleItemId, sale: { storeId } }, include: { sale: true } });
      if (!item) throw notFound('Sold item not found');
      if (item.sale.status === 'VOID') throw new AppError(400, 'This voucher is void');

      const covered = item.warrantyEnd && item.warrantyEnd.getTime() >= Date.now();
      if (!covered && !acknowledgeOutOfWarranty) {
        throw new AppError(409, item.warrantyEnd
          ? `Warranty expired on ${item.warrantyEnd.toISOString().slice(0, 10)}. Confirm to register it as an out-of-warranty service.`
          : 'This item was sold without warranty. Confirm to register it as a paid service.',
        { code: 'OUT_OF_WARRANTY' });
      }
      const ticketNo = await nextNumber(tx, storeId, 'WTY', 'WTY');
      return tx.warrantyClaim.create({
        data: { storeId, ticketNo, saleItemId, issue, outOfWarranty: !covered, createdById: userId },
        include: claimInclude,
      });
    });
    res.status(201).json(claim);
  }),
);

router.patch(
  '/claims/:id',
  requirePermission('warranty.manage'),
  validate({
    params: idParam,
    body: z.object({
      status: z.enum(['RECEIVED', 'IN_REPAIR', 'REPAIRED', 'REPLACED', 'REJECTED', 'RETURNED']),
      resolution: z.string().trim().max(2000).optional().nullable(),
      replacementSerial: z.string().trim().max(120).optional().nullable(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const claim = await prisma.warrantyClaim.findFirst({ where: { id: req.params.id, storeId: req.user.storeId } });
    if (!claim) throw notFound('Claim not found');
    const { status, resolution, replacementSerial } = req.body;
    const updated = await prisma.warrantyClaim.update({
      where: { id: claim.id },
      data: {
        status,
        ...(resolution !== undefined ? { resolution: resolution || null } : {}),
        ...(replacementSerial !== undefined ? { replacementSerial: replacementSerial || null } : {}),
        closedAt: CLOSED.includes(status) ? (claim.closedAt ?? new Date()) : null,
      },
      include: claimInclude,
    });
    res.json(updated);
  }),
);

export default {
  name: 'warranty',
  label: 'Warranty',
  path: 'warranty',
  scope: 'store',
  dependsOn: ['sales'],
  permissions: [
    { key: 'warranty.view', label: 'View warranty tracking & claims' },
    { key: 'warranty.manage', label: 'Register & update warranty claims' },
  ],
  router,
};
