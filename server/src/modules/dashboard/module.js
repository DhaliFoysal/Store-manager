import { Router } from 'express';
import { prisma } from '../../core/db.js';
import { asyncHandler } from '../../core/http.js';
import { requirePermission } from '../../core/auth.js';
import { D } from '../../core/money.js';
import { startOfDay } from '../../core/dates.js';

const router = Router();
const DAY = 86_400_000;
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

router.get(
  '/summary',
  requirePermission('reports.view'),
  asyncHandler(async (req, res) => {
    const storeId = req.user.storeId;
    const now = new Date();
    const today = startOfDay(now);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = new Date(today.getTime() - 6 * DAY);
    const live = { storeId, status: { not: 'VOID' } };

    const [todayAgg, monthAgg, dueAgg, creditAgg, lowStockCount, lowStock, expiring, openClaims, weekSales, recent, customers, products] = await Promise.all([
      prisma.sale.aggregate({ where: { ...live, createdAt: { gte: today } }, _sum: { total: true }, _count: true }),
      prisma.sale.aggregate({ where: { ...live, createdAt: { gte: monthStart } }, _sum: { total: true }, _count: true }),
      prisma.sale.aggregate({ where: { storeId, status: { in: ['DUE', 'PARTIAL'] } }, _sum: { dueAmount: true }, _count: true }),
      prisma.customer.aggregate({ where: { storeId }, _sum: { credit: true } }),
      prisma.product.count({ where: { storeId, isActive: true, totalStock: { lte: prisma.product.fields.reorderLevel } } }),
      prisma.product.findMany({
        where: { storeId, isActive: true, totalStock: { lte: prisma.product.fields.reorderLevel } },
        select: { id: true, name: true, sku: true, totalStock: true, reorderLevel: true },
        orderBy: { totalStock: 'asc' },
        take: 6,
      }),
      prisma.saleItem.count({ where: { warrantyEnd: { gte: now, lte: new Date(now.getTime() + 30 * DAY) }, sale: { storeId, status: { not: 'VOID' } } } }),
      prisma.warrantyClaim.count({ where: { storeId, status: { in: ['RECEIVED', 'IN_REPAIR', 'REPAIRED'] } } }),
      prisma.sale.findMany({ where: { ...live, createdAt: { gte: weekStart } }, select: { createdAt: true, total: true } }),
      prisma.sale.findMany({
        where: { storeId },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, voucherNo: true, total: true, status: true, createdAt: true, customer: { select: { name: true } } },
      }),
      prisma.customer.count({ where: { storeId } }),
      prisma.product.count({ where: { storeId, isActive: true } }),
    ]);

    const buckets = new Map();
    for (let i = 0; i < 7; i++) buckets.set(dayKey(new Date(weekStart.getTime() + i * DAY)), D(0));
    for (const s of weekSales) {
      const k = dayKey(s.createdAt);
      if (buckets.has(k)) buckets.set(k, buckets.get(k).add(s.total));
    }

    res.json({
      today: { total: todayAgg._sum.total ?? D(0), count: todayAgg._count },
      month: { total: monthAgg._sum.total ?? D(0), count: monthAgg._count },
      outstanding: { total: dueAgg._sum.dueAmount ?? D(0), count: dueAgg._count },
      customerCredit: creditAgg._sum.credit ?? D(0),
      lowStockCount,
      lowStock,
      warrantyExpiring: expiring,
      openClaims,
      customers,
      products,
      last7Days: [...buckets].map(([date, total]) => ({ date, total })),
      recentSales: recent,
    });
  }),
);

export default {
  name: 'dashboard',
  label: 'Dashboard',
  path: 'dashboard',
  scope: 'store',
  permissions: [{ key: 'reports.view', label: 'View dashboard & business summary' }],
  router,
};
