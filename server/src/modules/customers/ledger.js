import { D } from '../../core/money.js';
import { AppError } from '../../core/errors.js';

/**
 * The ONLY place a customer's credit balance changes. Every change writes a ledger row.
 * delta > 0 adds credit (deposit / overpayment / void refund); delta < 0 spends it.
 * Must run inside a transaction.
 */
export async function adjustCredit(tx, { storeId, customerId, delta, type, refType = null, refId = null, note = null, userId = null }) {
  const amount = D(delta);
  if (amount.isZero()) return null;

  if (amount.isNegative()) {
    const spend = amount.abs();
    const res = await tx.customer.updateMany({
      where: { id: customerId, storeId, credit: { gte: spend } },
      data: { credit: { decrement: spend } },
    });
    if (res.count === 0) throw new AppError(409, 'Insufficient customer credit');
  } else {
    const res = await tx.customer.updateMany({ where: { id: customerId, storeId }, data: { credit: { increment: amount } } });
    if (res.count === 0) throw new AppError(404, 'Customer not found');
  }
  const { credit } = await tx.customer.findUnique({ where: { id: customerId }, select: { credit: true } });
  return tx.customerLedger.create({
    data: { storeId, customerId, type, amount, balanceAfter: credit, refType, refId, note, userId },
  });
}
