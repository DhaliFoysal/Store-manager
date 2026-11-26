import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { asyncHandler, validate, idParam, pageQuery, pageArgs, pageMeta, optStr, optId, optBool } from '../../core/http.js';
import { requirePermission } from '../../core/auth.js';
import { badRequest, conflict, notFound } from '../../core/errors.js';
import { zMoney } from '../../core/money.js';
import { receiveStock, runTx } from '../inventory/service.js';

const router = Router();

const nullableStr = (max) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);

const productBody = z.object({
  name: z.string().trim().min(1).max(200),
  sku: z.string().trim().min(1).max(60),
  barcode: nullableStr(100),
  categoryId: z.coerce.number().int().positive().optional().nullable().transform((v) => v || null),
  description: nullableStr(2000),
  costPrice: zMoney.default(0),
  salePrice: zMoney,
  warrantyMonths: z.coerce.number().int().min(0).max(120).default(0),
  trackSerial: z.boolean().default(false),
  reorderLevel: z.coerce.number().int().min(0).max(1_000_000).default(0),
  isActive: z.boolean().default(true),
});

const createBody = productBody.extend({
  initialStock: z
    .object({
      warehouseId: z.coerce.number().int().positive(),
      quantity: z.coerce.number().int().min(1).optional(),
      serials: z.array(z.string().trim().min(1).max(120)).max(2000).optional(),
    })
    .optional(),
});

async function assertCategory(storeId, categoryId) {
  if (!categoryId) return;
  const c = await prisma.category.findFirst({ where: { id: categoryId, storeId } });
  if (!c) throw badRequest('Category not found');
}

router.get(
  '/',
  requirePermission('products.view'),
  validate({
    query: pageQuery.extend({ q: optStr, categoryId: optId, warehouseId: optId, lowStock: optBool, active: optBool }),
  }),
  asyncHandler(async (req, res) => {
    const { q, categoryId, warehouseId, lowStock, active, page, limit } = req.query;
    const where = {
      storeId: req.user.storeId,
      ...(categoryId ? { categoryId } : {}),
      ...(active !== undefined ? { isActive: active } : {}),
      ...(lowStock ? { totalStock: { lte: prisma.product.fields.reorderLevel } } : {}),
      ...(warehouseId ? { stock: { some: { warehouseId, quantity: { gt: 0 } } } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } },
              // find the product that owns a given serial number
              { units: { some: { serialNumber: { contains: q } } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        include: { category: { select: { id: true, name: true } }, stock: { select: { warehouseId: true, quantity: true } } },
        orderBy: { name: 'asc' },
        ...pageArgs({ page, limit }),
      }),
    ]);
    res.json({ data: rows, meta: pageMeta(page, limit, total) });
  }),
);

router.get(
  '/:id',
  requirePermission('products.view'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const product = await prisma.product.findFirst({
      where: { id: req.params.id, storeId: req.user.storeId },
      include: { category: true, stock: { include: { warehouse: { select: { id: true, name: true } } } } },
    });
    if (!product) throw notFound('Product not found');
    res.json(product);
  }),
);

router.post(
  '/',
  requirePermission('products.manage'),
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const storeId = req.user.storeId;
    const { initialStock, ...data } = req.body;
    await assertCategory(storeId, data.categoryId);
    if (initialStock && !data.trackSerial && !initialStock.quantity) throw badRequest('Enter the opening quantity');

    const product = await runTx(async (tx) => {
      const created = await tx.product.create({ data: { ...data, storeId } });
      if (initialStock) {
        await receiveStock(tx, {
          storeId, userId: req.user.id, productId: created.id,
          warehouseId: initialStock.warehouseId, quantity: initialStock.quantity, serials: initialStock.serials,
          note: 'Opening stock',
        });
      }
      return tx.product.findUnique({ where: { id: created.id } });
    });
    res.status(201).json(product);
  }),
);

router.put(
  '/:id',
  requirePermission('products.manage'),
  validate({ params: idParam, body: productBody }),
  asyncHandler(async (req, res) => {
    const storeId = req.user.storeId;
    const current = await prisma.product.findFirst({ where: { id: req.params.id, storeId } });
    if (!current) throw notFound('Product not found');
    await assertCategory(storeId, req.body.categoryId);
    if (req.body.trackSerial !== current.trackSerial) {
      const hasHistory = current.totalStock > 0 || (await prisma.productUnit.count({ where: { productId: current.id } })) > 0;
      if (hasHistory) throw conflict('Serial tracking cannot be changed once the product has stock or serial history');
    }
    res.json(await prisma.product.update({ where: { id: current.id }, data: req.body }));
  }),
);

router.delete(
  '/:id',
  requirePermission('products.manage'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const current = await prisma.product.findFirst({ where: { id: req.params.id, storeId: req.user.storeId } });
    if (!current) throw notFound('Product not found');
    if (current.totalStock > 0) throw conflict('Remove the remaining stock first, or deactivate the product instead');
    if ((await prisma.saleItem.count({ where: { productId: current.id } })) > 0) {
      throw conflict('This product appears on vouchers. Deactivate it instead of deleting.');
    }
    await prisma.product.delete({ where: { id: current.id } });
    res.status(204).end();
  }),
);

export default {
  name: 'products',
  label: 'Products',
  path: 'products',
  scope: 'store',
  dependsOn: ['inventory', 'categories'],
  permissions: [
    { key: 'products.view', label: 'View products' },
    { key: 'products.manage', label: 'Add, edit & delete products' },
  ],
  router,
};
