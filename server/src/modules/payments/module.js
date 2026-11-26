import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../core/db.js';
import { asyncHandler, validate, idParam, pageQuery, pageArgs, pageMeta, optStr, optId, optDate } from '../../core/http.js';
import { requirePermission } from '../../core/auth.js';
import { AppError, badRequest, notFound } from '../../core/errors.js';
import { D, Decimal, ZERO, zPosMoney } from '../../core/money.js';
import { endOfDay } from '../../core/dates.js';
import { nextNumber } from '../../core/numbering.js';
import { adjustCredit } from '../customers/ledger.js';

const router = Router();

const include = {
  sale: { select: { id: true, voucherNo: true, total: true, paidAmount: true, dueAmount: true, status: true, createdAt: true } },
  customer: { select: { id: true, name: true, phone: true, address: true, credit: true } },
  user: { select: { name: true } },
};

router.get(
  '/',
  requirePermission('payments.view'),
  validate({ query: pageQuery.extend({ q: optStr, saleId: optId, customerId: optId, from: optDate, to: optDate }) }),
  asyncHandler(async (req, res) => {
    const { q, saleId, customerId, from, to, page, limit } = req.query;
    const where = {
      storeId: req.user.storeId,
      ...(saleId ? { saleId } : {}),
      ...(customerId ? { customerId } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: endOfDay(to) } : {}) } } : {}),
      ...(q ? { OR: [{ slipNo: { contains: q } }, { reference: { contains: q } }, { sale: { voucherNo: { contains: q } } }, { customer: { name: { contains: q } } }, { customer: { phone: { contains: q } } }] } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({ where, include, orderBy: { createdAt: 'desc' }, ...pageArgs({ page, limit }) }),
    ]);
    res.json({ data: rows, meta: pageMeta(page, limit, total) });
  }),
);

// Payment slip (print data) – includes the store header for the A4 layout
router.get(
  '/:id',
  requirePermission('payments.view'),
  validate({ params: idParam }),
  asyncHandler(async (req, res) => {
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.id, storeId: req.user.storeId },
      include: { ...include, store: { select: { name: true, address: true, phone: true, email: true, voucherNotes: true, currency: true, logoPath: true } } },
    });
    if (!payment) throw notFound('Payment slip not found');
    const { store, ...rest } = payment;
    res.json({ ...rest, store: { ...store, logoUrl: store.logoPath ? `/uploads/${store.logoPath}` : null } });
  }),
);

/**
 * Payment slip.
 *  • with saleId  – settles (part of) a voucher's outstanding balance. Anything paid ABOVE the due
 *    amount is kept as customer credit (needs a customer on the voucher).
 *  • method CREDIT – pays the voucher from the customer's stored credit.
 *  • without saleId – an advance deposit; the whole amount becomes customer credit.
 */
const createBody = z.object({
  saleId: z.coerce.number().int().positive().optional().nullable().transform((v) => v || null),
  customerId: z.coerce.number().int().positive().optional().nullable().transform((v) => v || null),
  amount: zPosMoney,
  method: z.enum(['CASH', 'CARD', 'BKASH', 'NAGAD', 'BANK', 'CREDIT']),
  reference: z.string().trim().max(120).optional().nullable(),
  note: z.string().trim().max(255).optional().nullable(),
});

router.post(
  '/',
  requirePermission('payments.create'),
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    const { storeId, id: userId } = req.user;
    const input = req.body;

    const created = await prisma.$transaction(
      async (tx) => {
        let sale = null;
        let customer = null;

        if (input.saleId) {
          sale = await tx.sale.findFirst({ where: { id: input.saleId, storeId } });
          if (!sale) throw notFound('Voucher not found');
          if (sale.status === 'VOID') throw badRequest('This voucher is void');
          if (sale.customerId) customer = await tx.customer.findUnique({ where: { id: sale.customerId } });
        } else {
          if (!input.customerId) throw badRequest('Select a customer');
          customer = await tx.customer.findFirst({ where: { id: input.customerId, storeId } });
          if (!customer) throw notFound('Customer not found');
        }

        const amount = D(input.amount);
        let applied = ZERO;
        let credited = ZERO;

        if (sale) {
          if (sale.dueAmount.lte(0)) throw badRequest('This voucher has no outstanding balance');
          if (input.method === 'CREDIT') {
            if (!customer) throw badRequest('This voucher has no customer account to take credit from');
            if (amount.gt(sale.dueAmount)) throw badRequest('Credit payment cannot exceed the balance due');
            applied = amount;
          } else {
            applied = Decimal.min(amount, sale.dueAmount);
            credited = amount.sub(applied);
            if (credited.gt(0) && !customer) {
              throw badRequest(`Amount exceeds the balance due (${sale.dueAmount}). Attach a customer to the voucher to keep the excess as credit.`);
            }
          }
        } else {
          if (input.method === 'CREDIT') throw badRequest('A deposit cannot be paid with stored credit');
          credited = amount;
        }

        let dueAfter = null;
        if (sale) {
          // Atomic guard: two simultaneous payments can never push the balance below zero
          const upd = await tx.sale.updateMany({
            where: { id: sale.id, dueAmount: { gte: applied } },
            data: { paidAmount: { increment: applied }, dueAmount: { decrement: applied } },
          });
          if (upd.count === 0) throw new AppError(409, 'The voucher balance changed. Please reload and try again.');
          const fresh = await tx.sale.findUnique({ where: { id: sale.id } });
          dueAfter = fresh.dueAmount;
          await tx.sale.update({
            where: { id: sale.id },
            data: { status: fresh.paidAmount.gte(fresh.total) ? 'PAID' : 'PARTIAL' },
          });
        }

        const slipNo = await nextNumber(tx, storeId, 'PAY', 'PAY');
        const payment = await tx.payment.create({
          data: {
            storeId, slipNo, saleId: sale?.id ?? null, customerId: customer?.id ?? null, method: input.method,
            amount: applied.add(credited), appliedAmount: applied, creditedAmount: credited, saleDueAfter: dueAfter,
            reference: input.reference || null, note: input.note || null, userId,
          },
        });

        if (input.method === 'CREDIT') {
          await adjustCredit(tx, { storeId, customerId: customer.id, delta: amount.neg(), type: 'CREDIT_USED', refType: 'PAYMENT', refId: payment.id, note: sale.voucherNo, userId });
        } else if (credited.gt(0)) {
          await adjustCredit(tx, {
            storeId, customerId: customer.id, delta: credited, type: sale ? 'OVERPAYMENT' : 'DEPOSIT',
            refType: 'PAYMENT', refId: payment.id, note: sale ? `Overpayment on ${sale.voucherNo}` : 'Advance deposit', userId,
          });
        }
        return payment;
      },
      { timeout: 20_000 },
    );

    const full = await prisma.payment.findUnique({ where: { id: created.id }, include });
    res.status(201).json(full);
  }),
);

export default {
  name: 'payments',
  label: 'Payments',
  path: 'payments',
  scope: 'store',
  dependsOn: ['sales', 'customers'],
  permissions: [
    { key: 'payments.view', label: 'View payment slips' },
    { key: 'payments.create', label: 'Receive payments & customer deposits' },
  ],
  router,
};
