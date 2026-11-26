import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate, idParam, optStr, zPassword } from '../../core/http.js';
import { requirePermission } from '../../core/auth.js';
import * as svc from './service.js';

const router = Router();
router.use(requirePermission('users.manage'));

const email = z.string().trim().toLowerCase().email().max(190);
const phone = z.string().trim().max(40).optional().nullable().transform((v) => v || null);
const permissions = z.array(z.string().max(60)).max(100);

router.get(
  '/',
  validate({
    query: z.object({
      q: optStr,
      role: z.preprocess((v) => v || undefined, z.enum(['OWNER', 'ADMIN', 'USER']).optional()),
      status: z.preprocess((v) => v || undefined, z.enum(['ACTIVE', 'INACTIVE', 'PENDING']).optional()),
    }),
  }),
  asyncHandler(async (req, res) => res.json({ data: await svc.list(req.user.storeId, req.query) })),
);

router.post(
  '/',
  validate({
    body: z.object({
      name: z.string().trim().min(2).max(120),
      email,
      phone,
      role: z.enum(['ADMIN', 'USER']),
      status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
      permissions: permissions.default([]),
      password: zPassword,
    }),
  }),
  asyncHandler(async (req, res) => res.status(201).json(await svc.create(req.user, req.body))),
);

router.put(
  '/:id',
  validate({
    params: idParam,
    body: z.object({
      name: z.string().trim().min(2).max(120).optional(),
      phone: phone.optional(),
      role: z.enum(['ADMIN', 'USER']).optional(),
      status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
      permissions: permissions.optional(),
    }),
  }),
  asyncHandler(async (req, res) => res.json(await svc.update(req.user, req.params.id, req.body))),
);

router.post(
  '/:id/password',
  validate({ params: idParam, body: z.object({ password: zPassword }) }),
  asyncHandler(async (req, res) => {
    await svc.setPassword(req.user, req.params.id, req.body.password);
    res.json({ message: 'Password updated. The user has been signed out everywhere.' });
  }),
);

router.delete(
  '/:id',
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    await svc.remove(req.user, req.params.id);
    res.status(204).end();
  }),
);

export default {
  name: 'users',
  label: 'Users',
  path: 'users',
  scope: 'store',
  dependsOn: ['auth'],
  permissions: [{ key: 'users.manage', label: 'Create & manage users, reset passwords' }],
  router,
};
