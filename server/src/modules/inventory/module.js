import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { asyncHandler, validate, idParam, pageQuery, pageArgs, pageMeta, optStr, optId, optBool } from '../../core/http.js';
import { requirePermission } from '../../core/auth.js';
import { zMoney } from '../../core/money.js';
import * as svc from './service.js';

const router = Router();

const id = z.coerce.number().int().positive();
const serials = z.array(z.string().trim().min(1).max(120)).max(2000);
const note = z.string().trim().max(255).optional().nullable().transform((v) => v || null);

// Stock per product per warehouse
router.get(
  '/stock',
  requirePermission('inventory.view'),
  validate({ query: pageQuery.extend({ q: optStr, warehouseId: optId, categoryId: optId, lowOnly: optBool }) }),
  asyncHandler(async (req, res) => {
    const { q, warehouseId, categoryId, lowOnly, page, limit } = req.query;
    const where = {
      quantity: { gt: 0 },
      ...(warehouseId ? { warehouseId } : {}),
      warehouse: { storeId: req.user.storeId },
      product: {
        ...(categoryId ? { categoryId } : {}),
        ...(q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }] } : {}),
        ...(lowOnly ? { totalStock: { lte: prisma.product.fields.reorderLevel } } : {}),
      },
    };
    const [total, rows] = await Promise.all([
      prisma.stockLevel.count({ where }),
      prisma.stockLevel.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true, barcode: true, trackSerial: true, reorderLevel: true, totalStock: true, category: { select: { name: true } } } },
          warehouse: { select: { id: true, name: true } },
        },
        orderBy: [{ product: { name: 'asc' } }, { warehouseId: 'asc' }],
        ...pageArgs({ page, limit }),
      }),
    ]);
    res.json({ data: rows, meta: pageMeta(page, limit, total) });
  }),
);

// Product picker for stock forms (doesn't require products.view)
router.get(
  '/products',
  requirePermission('inventory.view'),
  validate({ query: z.object({ q: optStr }) }),
  asyncHandler(async (req, res) => {
    const { q } = req.query;
    const rows = await prisma.product.findMany({
      where: {
        storeId: req.user.storeId, isActive: true,
        ...(q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }] } : {}),
      },
      select: { id: true, name: true, sku: true, trackSerial: true, totalStock: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
    res.json({ data: rows });
  }),
);

// Serial-number search: where is this unit, was it sold, to whom, is it under warranty?
router.get(
  '/units',
  requirePermission('inventory.view'),
  validate({
    query: pageQuery.extend({
      q: optStr, productId: optId, warehouseId: optId,
      status: z.preprocess((v) => v || undefined, z.enum(['IN_STOCK', 'SOLD', 'DEFECTIVE', 'LOST']).optional()),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { q, productId, warehouseId, status, page, limit } = req.query;
    const where = {
      storeId: req.user.storeId,
      ...(q ? { serialNumber: { contains: q } } : {}),
      ...(productId ? { productId } : {}),
      ...(warehouseId ? { warehouseId } : {}),
      ...(status ? { status } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.productUnit.count({ where }),
      prisma.productUnit.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true, warrantyMonths: true } },
          warehouse: { select: { id: true, name: true } },
          saleItem: {
            select: {
              warrantyStart: true, warrantyEnd: true,
              sale: { select: { id: true, voucherNo: true, createdAt: true, status: true, customer: { select: { id: true, name: true, phone: true } } } },
            },
          },
        },
        orderBy: { serialNumber: 'asc' },
        ...pageArgs({ page, limit }),
      }),
    ]);
    res.json({ data: rows, meta: pageMeta(page, limit, total) });
  }),
);

router.get(
  '/movements',
  requirePermission('inventory.view'),
  validate({ query: pageQuery.extend({ productId: optId, warehouseId: optId }) }),
  asyncHandler(async (req, res) => {
    const { productId, warehouseId, page, limit } = req.query;
    const where = { storeId: req.user.storeId, ...(productId ? { productId } : {}), ...(warehouseId ? { warehouseId } : {}) };
    const [total, rows] = await Promise.all([
      prisma.stockMovement.count({ where }),
      prisma.stockMovement.findMany({
        where,
        include: { product: { select: { name: true, sku: true } }, warehouse: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        ...pageArgs({ page, limit }),
      }),
    ]);
    res.json({ data: rows, meta: pageMeta(page, limit, total) });
  }),
);

router.post(
  '/receive',
  requirePermission('inventory.manage'),
  validate({
    body: z.object({
      productId: id, warehouseId: id,
      quantity: z.coerce.number().int().min(1).max(1_000_000).optional(),
      serials: serials.optional(),
      costPrice: zMoney.optional(),
      note,
    }),
  }),
  asyncHandler(async (req, res) => {
    const out = await svc.runTx((tx) => svc.receiveStock(tx, { ...req.body, storeId: req.user.storeId, userId: req.user.id }));
    res.status(201).json(out);
  }),
);

router.post(
  '/adjust',
  requirePermission('inventory.manage'),
  validate({
    body: z.object({
      productId: id, warehouseId: id,
      delta: z.coerce.number().int().refine((v) => v !== 0, 'Adjustment cannot be 0'),
      note: z.string().trim().min(3, 'Please give a reason').max(255),
    }),
  }),
  asyncHandler(async (req, res) => {
    await svc.runTx((tx) => svc.adjustManually(tx, { ...req.body, storeId: req.user.storeId, userId: req.user.id }));
    res.json({ ok: true });
  }),
);

router.post(
  '/transfer',
  requirePermission('inventory.manage'),
  validate({
    body: z.object({
      productId: id, fromWarehouseId: id, toWarehouseId: id,
      quantity: z.coerce.number().int().min(1).optional(),
      serials: serials.optional(),
      note,
    }),
  }),
  asyncHandler(async (req, res) => {
    const out = await svc.runTx((tx) => svc.transfer(tx, { ...req.body, storeId: req.user.storeId, userId: req.user.id }));
    res.json(out);
  }),
);

router.patch(
  '/units/:id',
  requirePermission('inventory.manage'),
  validate({ params: idParam, body: z.object({ status: z.enum(['IN_STOCK', 'DEFECTIVE', 'LOST']), note }) }),
  asyncHandler(async (req, res) => {
    const unit = await svc.runTx((tx) =>
      svc.setUnitStatus(tx, { storeId: req.user.storeId, userId: req.user.id, unitId: req.params.id, ...req.body }),
    );
    res.json(unit);
  }),
);

export { svc as inventoryService };

export default {
  name: 'inventory',
  label: 'Inventory',
  path: 'inventory',
  scope: 'store',
  permissions: [
    { key: 'inventory.view', label: 'View stock, serial numbers & movements' },
    { key: 'inventory.manage', label: 'Receive, adjust & transfer stock' },
  ],
  router,
};
