import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { asyncHandler, validate, idParam } from '../../core/http.js';
import { badRequest, notFound } from '../../core/errors.js';
import { hashPassword } from '../../core/password.js';
import { zPassword } from '../../core/http.js';
import { provisionStore } from '../stores/service.js';

// Platform (super admin) area: approve registrations, suspend stores, reset owner passwords.
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

export default {
  name: 'platform',
  path: 'platform',
  scope: 'platform',
  dependsOn: ['stores'],
  permissions: [], // super admin permission is implicit; not assignable to store users
  router,
};
