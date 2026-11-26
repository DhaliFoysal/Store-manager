import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { asyncHandler, validate, idParam, pageQuery, pageArgs, pageMeta, optStr, optId, optDate } from '../../core/http.js';
import { requirePermission } from '../../core/auth.js';
import { zMoney } from '../../core/money.js';
import { endOfDay } from '../../core/dates.js';
import * as svc from './service.js';

const router = Router();

const itemSchema = z.object({
  productId: z.coerce.number().int().positive(),
  unitId: z.coerce.number().int().positive().optional().nullable().transform((v) => v || undefined),
  quantity: z.coerce.number().int().min(1).max(100_000).default(1),
  unitPrice: zMoney.optional(),
  discount: zMoney.default(0),
});

const createBody = z.object({
  customerId: z.coerce.number().int().positive().optional().nullable().transform((v) => v || null),
  warehouseId: z.coerce.number().int().positive(),
  items: z.array(itemSchema).min(1, 'Add at least one item').max(200),
  discount: zMoney.default(0),
  creditUsed: zMoney.default(0),
  paidAmount: zMoney.default(0),
  paymentMethod: z.enum(['CASH', 'CARD', 'BKASH', 'NAGAD', 'BANK']).default('CASH'),
  paymentReference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

// ── POS helpers (declared before /:id) ──
router.get(
  '/lookup',
  requirePermission('sales.create'),
  validate({ query: z.object({ code: z.string().trim().min(1).max(120), warehouseId: optId }) }),
  asyncHandler(async (req, res) => res.json(await svc.lookupCode(req.user.storeId, req.query.code, req.query.warehouseId))),
);

router.get(
  '/search',
  requirePermission('sales.create'),
  validate({ query: z.object({ q: z.string().trim().min(1).max(120), warehouseId: optId }) }),
  asyncHandler(async (req, res) => res.json({ data: await svc.searchProducts(req.user.storeId, req.query.q, req.query.warehouseId) })),
);

router.get(
  '/available-units',
  requirePermission('sales.create'),
  validate({ query: z.object({ productId: z.coerce.number().int().positive(), warehouseId: z.coerce.number().int().positive() }) }),
  asyncHandler(async (req, res) =>
    res.json({ data: await svc.availableUnits(req.user.storeId, req.query.productId, req.query.warehouseId) }),
  ),
);

// ── vouchers ──
router.get(
  '/',
  requirePermission('sales.view'),
  validate({
    query: pageQuery.extend({
      q: optStr,
      status: optStr, // comma separated: DUE,PARTIAL
      customerId: optId,
      from: optDate,
      to: optDate,
    }),
  }),
  asyncHandler(async (req, res) => {
    const { q, status, customerId, from, to, page, limit } = req.query;
    const statuses = status ? status.split(',').filter((s) => ['PAID', 'PARTIAL', 'DUE', 'VOID'].includes(s)) : [];
    const where = {
      storeId: req.user.storeId,
      ...(statuses.length ? { status: { in: statuses } } : {}),
      ...(customerId ? { customerId } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: endOfDay(to) } : {}) } } : {}),
      ...(q
        ? {
            OR: [
              { voucherNo: { contains: q } },
              { customer: { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } },
              { items: { some: { serialNumber: { contains: q } } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.sale.count({ where }),
      prisma.sale.findMany({
        where,
        include: { customer: { select: { id: true, name: true, phone: true } }, user: { select: { name: true } }, _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
        ...pageArgs({ page, limit }),
      }),
    ]);
    res.json({ data: rows, meta: pageMeta(page, limit, total) });
  }),
);

router.get(
  '/:id',
  requirePermission('sales.view'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => res.json(await svc.getSale(prisma, req.user.storeId, req.params.id))),
);

router.post(
  '/',
  requirePermission('sales.create'),
  validate({ body: createBody }),
  asyncHandler(async (req, res) => res.status(201).json(await svc.createSale(req.user, req.body))),
);

router.post(
  '/:id/void',
  requirePermission('sales.void'),
  validate({ params: idParam, body: z.object({ reason: z.string().trim().min(3, 'Please give a reason').max(255) }) }),
  asyncHandler(async (req, res) => res.json(await svc.voidSale(req.user, req.params.id, req.body.reason))),
);

export default {
  name: 'sales',
  label: 'Sales & POS',
  path: 'sales',
  scope: 'store',
  dependsOn: ['inventory', 'customers', 'products'],
  permissions: [
    { key: 'sales.view', label: 'View vouchers' },
    { key: 'sales.create', label: 'Use the POS / create sales' },
    { key: 'sales.override_price', label: 'Change selling price at the POS' },
    { key: 'sales.void', label: 'Void vouchers' },
  ],
  router,
};
