import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { asyncHandler, validate, idParam } from '../../core/http.js';
import { requirePermission } from '../../core/auth.js';
import { badRequest, notFound } from '../../core/errors.js';

const router = Router();

const body = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().max(255).optional().nullable().transform((v) => v || null),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

const load = async (storeId, id) => {
  const w = await prisma.warehouse.findFirst({ where: { id, storeId } });
  if (!w) throw notFound('Warehouse not found');
  return w;
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await prisma.warehouse.findMany({
      where: { storeId: req.user.storeId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    // units of stock held per warehouse
    const sums = await prisma.stockLevel.groupBy({
      by: ['warehouseId'],
      where: { warehouseId: { in: rows.map((r) => r.id) } },
      _sum: { quantity: true },
    });
    const byId = new Map(sums.map((s) => [s.warehouseId, s._sum.quantity ?? 0]));
    res.json({ data: rows.map((r) => ({ ...r, totalUnits: byId.get(r.id) ?? 0 })) });
  }),
);

router.post(
  '/',
  requirePermission('warehouses.manage'),
  validate({ body }),
  asyncHandler(async (req, res) => {
    const storeId = req.user.storeId;
    const created = await prisma.$transaction(async (tx) => {
      if (req.body.isDefault) await tx.warehouse.updateMany({ where: { storeId }, data: { isDefault: false } });
      return tx.warehouse.create({ data: { ...req.body, storeId } });
    });
    res.status(201).json(created);
  }),
);

router.put(
  '/:id',
  requirePermission('warehouses.manage'),
  validate({ params: idParam, body }),
  asyncHandler(async (req, res) => {
    const storeId = req.user.storeId;
    const current = await load(storeId, req.params.id);
    if (current.isDefault && !req.body.isDefault) throw badRequest('Pick another warehouse as default instead of un-setting this one');
    if (current.isDefault && !req.body.isActive) throw badRequest('The default warehouse cannot be deactivated');
    const updated = await prisma.$transaction(async (tx) => {
      if (req.body.isDefault) await tx.warehouse.updateMany({ where: { storeId, id: { not: current.id } }, data: { isDefault: false } });
      return tx.warehouse.update({ where: { id: current.id }, data: req.body });
    });
    res.json(updated);
  }),
);

router.delete(
  '/:id',
  requirePermission('warehouses.manage'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const w = await load(req.user.storeId, req.params.id);
    if (w.isDefault) throw badRequest('The default warehouse cannot be deleted');
    const stock = await prisma.stockLevel.aggregate({ where: { warehouseId: w.id }, _sum: { quantity: true } });
    if ((stock._sum.quantity ?? 0) > 0) throw badRequest('Move the remaining stock to another warehouse first');
    await prisma.warehouse.delete({ where: { id: w.id } }); // history exists -> P2003 -> 409 "deactivate instead"
    res.status(204).end();
  }),
);

export default {
  name: 'warehouses',
  label: 'Warehouses',
  path: 'warehouses',
  scope: 'store',
  permissions: [{ key: 'warehouses.manage', label: 'Create, edit & delete warehouses' }],
  router,
};
