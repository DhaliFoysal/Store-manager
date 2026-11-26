import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { asyncHandler, validate, idParam } from '../../core/http.js';
import { badRequest, notFound } from '../../core/errors.js';
import { hashPassword } from '../../core/password.js';
import { zPassword } from '../../core/http.js';
import { applyDefaults, provisionStore } from '../stores/service.js';

// Platform (super admin) area: approve registrations, suspend stores, reset owner passwords, manage defaults.
const router = Router();

const ownerSelect = { id: true, name: true, email: true, phone: true, status: true, createdAt: true, lastLoginAt: true };

router.get(
  '/registrations',
  validate({ query: z.object({ status: z.enum(['PENDING', 'REJECTED']).default('PENDING') }) }),
  asyncHandler(async (req, res) => {
    const owners = await prisma.user.findMany({
      where: { role: 'OWNER', status: req.query.status },
      select: { ...ownerSelect, store: { select: { id: true, name: true, phone: true } } },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data: owners });
  }),
);

router.post(
  '/registrations/:id/approve',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.$transaction(async (tx) => {
      const owner = await tx.user.findFirst({ where: { id: req.params.id, role: 'OWNER' } });
      if (!owner || !owner.storeId) throw notFound('Registration not found');
      if (owner.status === 'ACTIVE') throw badRequest('Already approved');
      await tx.user.update({ where: { id: owner.id }, data: { status: 'ACTIVE' } });
      await tx.store.update({ where: { id: owner.storeId }, data: { status: 'ACTIVE' } });
      await provisionStore(tx, owner.storeId);
    });
    res.json({ message: 'Registration approved' });
  }),
);

router.post(
  '/registrations/:id/reject',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const owner = await prisma.user.findFirst({ where: { id: req.params.id, role: 'OWNER', status: 'PENDING' } });
    if (!owner) throw notFound('Pending registration not found');
    await prisma.user.update({ where: { id: owner.id }, data: { status: 'REJECTED' } });
    res.json({ message: 'Registration rejected' });
  }),
);

router.get(
  '/stores',
  asyncHandler(async (req, res) => {
    const stores = await prisma.store.findMany({
      where: { status: { not: 'PENDING' } },
      include: {
        users: { where: { role: 'OWNER' }, select: ownerSelect },
        _count: { select: { users: true, products: true, sales: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: stores });
  }),
);

router.patch(
  '/stores/:id/status',
  validate({ params: idParam, body: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }) }),
  asyncHandler(async (req, res) => {
    const store = await prisma.store.update({ where: { id: req.params.id }, data: { status: req.body.status } });
    res.json({ id: store.id, status: store.status });
  }),
);

router.post(
  '/owners/:id/password',
  validate({ params: idParam, body: z.object({ password: zPassword }) }),
  asyncHandler(async (req, res) => {
    const owner = await prisma.user.findFirst({ where: { id: req.params.id, role: 'OWNER' } });
    if (!owner) throw notFound('Owner not found');
    await prisma.user.update({ where: { id: owner.id }, data: { passwordHash: await hashPassword(req.body.password) } });
    await prisma.refreshToken.updateMany({ where: { userId: owner.id, revokedAt: null }, data: { revokedAt: new Date() } });
    res.json({ message: 'Owner password reset' });
  }),
);

// ───────── Default categories & warehouses (copied into every newly approved store) ─────────
const nullable = (max) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const catBody = z.object({ name: z.string().trim().min(1).max(120), description: nullable(255) });
const whBody = z.object({ name: z.string().trim().min(1).max(120), address: nullable(255), isDefault: z.boolean().default(false) });

router.get(
  '/defaults',
  asyncHandler(async (req, res) => {
    const [categories, warehouses] = await Promise.all([
      prisma.defaultCategory.findMany({ orderBy: { name: 'asc' } }),
      prisma.defaultWarehouse.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
    ]);
    res.json({ categories, warehouses });
  }),
);

router.post(
  '/defaults/categories',
  validate({ body: catBody }),
  asyncHandler(async (req, res) => res.status(201).json(await prisma.defaultCategory.create({ data: req.body }))),
);

router.put(
  '/defaults/categories/:id',
  validate({ params: idParam, body: catBody }),
  asyncHandler(async (req, res) => res.json(await prisma.defaultCategory.update({ where: { id: req.params.id }, data: req.body }))),
);

router.delete(
  '/defaults/categories/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.defaultCategory.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

router.post(
  '/defaults/warehouses',
  validate({ body: whBody }),
  asyncHandler(async (req, res) => {
    const created = await prisma.$transaction(async (tx) => {
      if (req.body.isDefault) await tx.defaultWarehouse.updateMany({ data: { isDefault: false } });
      return tx.defaultWarehouse.create({ data: req.body });
    });
    res.status(201).json(created);
  }),
);

router.put(
  '/defaults/warehouses/:id',
  validate({ params: idParam, body: whBody }),
  asyncHandler(async (req, res) => {
    const updated = await prisma.$transaction(async (tx) => {
      if (req.body.isDefault) await tx.defaultWarehouse.updateMany({ where: { id: { not: req.params.id } }, data: { isDefault: false } });
      return tx.defaultWarehouse.update({ where: { id: req.params.id }, data: req.body });
    });
    res.json(updated);
  }),
);

router.delete(
  '/defaults/warehouses/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await prisma.defaultWarehouse.delete({ where: { id: req.params.id } });
    res.status(204).end();
  }),
);

// Adds any missing defaults to every active store (never deletes or renames anything)
router.post(
  '/defaults/apply',
  asyncHandler(async (req, res) => {
    const stores = await prisma.store.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    for (const s of stores) await prisma.$transaction((tx) => applyDefaults(tx, s.id), { timeout: 20_000 });
    res.json({ message: `Defaults applied to ${stores.length} store(s)`, stores: stores.length });
  }),
);

export default {
  name: 'platform',
  path: 'platform',
  scope: 'platform',
  dependsOn: ['stores'],
  permissions: [], // super admin permission is implicit; not assignable to store users
  router,
};
