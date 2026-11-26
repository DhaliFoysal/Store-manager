import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { asyncHandler, validate, idParam, pageQuery, pageArgs, pageMeta, optStr } from '../../core/http.js';
import { requirePermission } from '../../core/auth.js';
import { notFound } from '../../core/errors.js';
import { D } from '../../core/money.js';

const router = Router();

const body = z.object({
  name: z.string().trim().min(1).max(150),
  phone: z.string().trim().min(5, 'Enter a valid phone number').max(40),
  email: z.string().trim().email().max(150).optional().nullable().or(z.literal('')).transform((v) => v || null),
  address: z.string().trim().max(1000).optional().nullable().transform((v) => v || null),
});

const OPEN = { status: { in: ['DUE', 'PARTIAL'] } };

router.get(
  '/',
  requirePermission('customers.view'),
  validate({ query: pageQuery.extend({ q: optStr, hasDue: z.preprocess((v) => v === 'true' || undefined, z.boolean().optional()) }) }),
  asyncHandler(async (req, res) => {
    const { q, hasDue, page, limit } = req.query;
    const storeId = req.user.storeId;
    const where = {
      storeId,
      ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }, { address: { contains: q } }, { email: { contains: q } }] } : {}),
      ...(hasDue ? { sales: { some: { ...OPEN } } } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.customer.count({ where }),
      prisma.customer.findMany({ where, orderBy: { name: 'asc' }, ...pageArgs({ page, limit }), include: { _count: { select: { sales: true } } } }),
    ]);
    const dues = await prisma.sale.groupBy({
      by: ['customerId'],
      where: { storeId, customerId: { in: rows.map((r) => r.id) }, ...OPEN },
      _sum: { dueAmount: true },
    });
    const dueBy = new Map(dues.map((d) => [d.customerId, d._sum.dueAmount]));
    res.json({
      data: rows.map((r) => ({ ...r, totalDue: dueBy.get(r.id) ?? D(0) })),
      meta: pageMeta(page, limit, total),
    });
  }),
);

// Light-weight search used by the POS / payment pickers
router.get(
  '/search',
  validate({ query: z.object({ q: optStr }) }),
  asyncHandler(async (req, res) => {
    const { q } = req.query;
    const rows = await prisma.customer.findMany({
      where: { storeId: req.user.storeId, ...(q ? { OR: [{ name: { contains: q } }, { phone: { contains: q } }] } : {}) },
      select: { id: true, name: true, phone: true, address: true, credit: true },
      orderBy: { name: 'asc' },
      take: 15,
    });
    res.json({ data: rows });
  }),
);

router.get(
  '/:id',
  requirePermission('customers.view'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const storeId = req.user.storeId;
    const customer = await prisma.customer.findFirst({ where: { id: req.params.id, storeId } });
    if (!customer) throw notFound('Customer not found');
    const [sales, payments, ledger, dueAgg, totalAgg] = await Promise.all([
      prisma.sale.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' }, take: 100,
        select: { id: true, voucherNo: true, total: true, paidAmount: true, dueAmount: true, status: true, createdAt: true } }),
      prisma.payment.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' }, take: 100,
        include: { sale: { select: { id: true, voucherNo: true } } } }),
      prisma.customerLedger.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.sale.aggregate({ where: { customerId: customer.id, ...OPEN }, _sum: { dueAmount: true } }),
      prisma.sale.aggregate({ where: { customerId: customer.id, status: { not: 'VOID' } }, _sum: { total: true }, _count: true }),
    ]);
    res.json({
      customer,
      summary: { totalDue: dueAgg._sum.dueAmount ?? D(0), totalPurchases: totalAgg._sum.total ?? D(0), voucherCount: totalAgg._count },
      sales, payments, ledger,
    });
  }),
);

router.post(
  '/',
  requirePermission('customers.manage'),
  validate({ body }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await prisma.customer.create({ data: { ...req.body, storeId: req.user.storeId } }));
  }),
);

router.put(
  '/:id',
  requirePermission('customers.manage'),
  validate({ params: idParam, body }),
  asyncHandler(async (req, res) => {
    const found = await prisma.customer.findFirst({ where: { id: req.params.id, storeId: req.user.storeId } });
    if (!found) throw notFound('Customer not found');
    res.json(await prisma.customer.update({ where: { id: found.id }, data: req.body }));
  }),
);

router.delete(
  '/:id',
  requirePermission('customers.manage'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const found = await prisma.customer.findFirst({ where: { id: req.params.id, storeId: req.user.storeId } });
    if (!found) throw notFound('Customer not found');
    await prisma.customer.delete({ where: { id: found.id } }); // has vouchers -> 409
    res.status(204).end();
  }),
);

export default {
  name: 'customers',
  label: 'Customers',
  path: 'customers',
  scope: 'store',
  permissions: [
    { key: 'customers.view', label: 'View customers' },
    { key: 'customers.manage', label: 'Add, edit & delete customers' },
  ],
  router,
};
