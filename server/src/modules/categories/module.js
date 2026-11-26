import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { asyncHandler, validate, idParam } from '../../core/http.js';
import { requirePermission } from '../../core/auth.js';
import { notFound } from '../../core/errors.js';

const router = Router();

const body = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(255).optional().nullable().transform((v) => v || null),
});

// Reading is open to every signed-in store user (needed by dropdowns everywhere)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rows = await prisma.category.findMany({
      where: { storeId: req.user.storeId },
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
    res.json({ data: rows });
  }),
);

router.post(
  '/',
  requirePermission('categories.manage'),
  validate({ body }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await prisma.category.create({ data: { ...req.body, storeId: req.user.storeId } }));
  }),
);

router.put(
  '/:id',
  requirePermission('categories.manage'),
  validate({ params: idParam, body }),
  asyncHandler(async (req, res) => {
    const found = await prisma.category.findFirst({ where: { id: req.params.id, storeId: req.user.storeId } });
    if (!found) throw notFound('Category not found');
    res.json(await prisma.category.update({ where: { id: found.id }, data: req.body }));
  }),
);

// Products in the category are kept (categoryId becomes null)
router.delete(
  '/:id',
  requirePermission('categories.manage'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const found = await prisma.category.findFirst({ where: { id: req.params.id, storeId: req.user.storeId } });
    if (!found) throw notFound('Category not found');
    await prisma.category.delete({ where: { id: found.id } });
    res.status(204).end();
  }),
);

export default {
  name: 'categories',
  label: 'Categories',
  path: 'categories',
  scope: 'store',
  permissions: [{ key: 'categories.manage', label: 'Create, edit & delete product categories' }],
  router,
};
