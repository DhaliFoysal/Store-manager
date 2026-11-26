import { prisma } from '../../core/db.js';
import { AppError, badRequest, forbidden, notFound } from '../../core/errors.js';
import { D, Decimal, ZERO } from '../../core/money.js';
import { addMonths } from '../../core/dates.js';
import { nextNumber } from '../../core/numbering.js';
import { adjustStock } from '../inventory/service.js';
import { adjustCredit } from '../customers/ledger.js';

const fullInclude = {
  items: { orderBy: { id: 'asc' } },
  customer: { select: { id: true, name: true, phone: true, address: true, email: true, credit: true } },
  user: { select: { id: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  payments: { orderBy: { createdAt: 'asc' } },
  store: { select: { id: true, name: true, address: true, phone: true, email: true, voucherNotes: true, currency: true, logoPath: true } },
};

export async function getSale(db, storeId, id) {
  const sale = await db.sale.findFirst({ where: { id, storeId }, include: fullInclude });
  if (!sale) throw notFound('Voucher not found');
  const { store, ...rest } = sale;
  return { ...rest, store: { ...store, logoUrl: store.logoPath ? `/uploads/${store.logoPath}` : null } };
}

const statusFor = (total, paid) => (paid.gte(total) ? 'PAID' : paid.gt(0) ? 'PARTIAL' : 'DUE');

/**
 * Creates a voucher (sale), reserves/sells serial units, decrements stock, records payment slips
 * and adjusts the customer's credit – all in ONE transaction.
 *
 * Money rules:
 *   total      = Σ(line) − order discount
 *   creditUsed = part of total paid from the customer's stored credit
 *   applied    = min(cash paid, total − creditUsed)
 *   excess     = cash paid − applied   → credited to the customer (or returned as change if walk-in)
 *   due        = total − creditUsed − applied
 */
export async function createSale(actor, input) {
  const { storeId, id: userId } = actor;

  return prisma.$transaction(
    async (tx) => {
      const warehouse = await tx.warehouse.findFirst({ where: { id: input.warehouseId, storeId, isActive: true } });
      if (!warehouse) throw badRequest('Warehouse not found or inactive');

      let customer = null;
      if (input.customerId) {
        customer = await tx.customer.findFirst({ where: { id: input.customerId, storeId } });
        if (!customer) throw badRequest('Customer not found');
      }

      const productIds = [...new Set(input.items.map((i) => i.productId))];
      const products = await tx.product.findMany({ where: { id: { in: productIds }, storeId, isActive: true } });
      const productById = new Map(products.map((p) => [p.id, p]));

      const unitIds = input.items.filter((i) => i.unitId).map((i) => i.unitId);
      if (new Set(unitIds).size !== unitIds.length) throw badRequest('The same serial number was added more than once');
      const units = unitIds.length
        ? await tx.productUnit.findMany({ where: { id: { in: unitIds }, storeId, warehouseId: warehouse.id, status: 'IN_STOCK' } })
        : [];
      const unitById = new Map(units.map((u) => [u.id, u]));

      const canOverridePrice = actor.permissions.includes('sales.override_price');
      const now = new Date();
      const lines = [];
      let subtotal = ZERO;

      for (const it of input.items) {
        const p = productById.get(it.productId);
        if (!p) throw badRequest('One of the products is no longer available');

        let qty = it.quantity;
        let unit = null;
        if (p.trackSerial) {
          if (!it.unitId) throw badRequest(`Select a serial number for "${p.name}"`);
          unit = unitById.get(it.unitId);
          if (!unit || unit.productId !== p.id) throw new AppError(409, `The selected serial number for "${p.name}" is not available`);
          qty = 1;
        } else if (it.unitId) {
          throw badRequest(`"${p.name}" is not serial-tracked`);
        }

        let price = p.salePrice;
        if (it.unitPrice != null && !D(it.unitPrice).equals(p.salePrice)) {
          if (!canOverridePrice) throw forbidden('You are not allowed to change the selling price');
          price = D(it.unitPrice);
        }
        const gross = price.mul(qty);
        const discount = D(it.discount ?? 0);
        if (discount.gt(gross)) throw badRequest(`Discount on "${p.name}" exceeds the line amount`);
        const lineTotal = gross.sub(discount);

        lines.push({
          product: p,
          unit,
          qty,
          data: {
            productId: p.id,
            productUnitId: unit?.id ?? null,
            productName: p.name,
            sku: p.sku,
            serialNumber: unit?.serialNumber ?? null,
            quantity: qty,
            unitPrice: price,
            discount,
            lineTotal,
            warrantyMonths: p.warrantyMonths,
            warrantyStart: p.warrantyMonths > 0 ? now : null,
            warrantyEnd: p.warrantyMonths > 0 ? addMonths(now, p.warrantyMonths) : null,
          },
        });
        subtotal = subtotal.add(lineTotal);
      }

      const orderDiscount = D(input.discount ?? 0);
      if (orderDiscount.gt(subtotal)) throw badRequest('Discount cannot exceed the subtotal');
      const total = subtotal.sub(orderDiscount);

      // ── payment maths ──
      const creditUsed = D(input.creditUsed ?? 0);
      const cashPaid = D(input.paidAmount ?? 0);
      if (creditUsed.gt(0)) {
        if (!customer) throw badRequest('Select a customer to use stored credit');
        if (creditUsed.gt(customer.credit)) throw badRequest('Not enough credit on the customer account');
        if (creditUsed.gt(total)) throw badRequest('Credit used cannot exceed the voucher total');
      }
      const payable = total.sub(creditUsed);
      const applied = Decimal.min(cashPaid, payable);
      const excess = cashPaid.sub(applied);
      const due = payable.sub(applied);

      if (due.gt(0) && !customer) throw badRequest('Select a customer to sell on credit (an unpaid balance needs an account)');

      const creditedExcess = customer ? excess : ZERO;
      const changeReturned = customer ? ZERO : excess;
      const paidAmount = creditUsed.add(applied);

      const voucherNo = await nextNumber(tx, storeId, 'VCH', 'VCH');
      const sale = await tx.sale.create({
        data: {
          storeId, voucherNo, customerId: customer?.id ?? null, warehouseId: warehouse.id, userId,
          subtotal, discount: orderDiscount, total, creditUsed, paidAmount, dueAmount: due, changeReturned,
          status: statusFor(total, paidAmount), notes: input.notes || null,
          items: { create: lines.map((l) => l.data) },
        },
      });

      if (unitIds.length) {
        const sold = await tx.productUnit.updateMany({ where: { id: { in: unitIds }, status: 'IN_STOCK' }, data: { status: 'SOLD' } });
        if (sold.count !== unitIds.length) throw new AppError(409, 'A serial number was sold by someone else just now. Please re-check the cart.');
      }
      for (const l of lines) {
        await adjustStock(tx, {
          storeId, productId: l.product.id, warehouseId: warehouse.id, delta: -l.qty, type: 'SALE',
          refType: 'SALE', refId: sale.id, userId, label: l.product.name,
        });
      }

      // ── payment slips ──
      if (creditUsed.gt(0)) {
        await tx.payment.create({
          data: {
            storeId, slipNo: await nextNumber(tx, storeId, 'PAY', 'PAY'), saleId: sale.id, customerId: customer.id,
            method: 'CREDIT', amount: creditUsed, appliedAmount: creditUsed, creditedAmount: ZERO,
            saleDueAfter: payable, note: 'Paid from customer credit', userId,
          },
        });
        await adjustCredit(tx, { storeId, customerId: customer.id, delta: creditUsed.neg(), type: 'CREDIT_USED', refType: 'SALE', refId: sale.id, note: sale.voucherNo, userId });
      }
      if (cashPaid.gt(0)) {
        await tx.payment.create({
          data: {
            storeId, slipNo: await nextNumber(tx, storeId, 'PAY', 'PAY'), saleId: sale.id, customerId: customer?.id ?? null,
            method: input.paymentMethod, amount: applied.add(creditedExcess), appliedAmount: applied, creditedAmount: creditedExcess,
            saleDueAfter: due, reference: input.paymentReference || null, userId,
          },
        });
        if (creditedExcess.gt(0)) {
          await adjustCredit(tx, { storeId, customerId: customer.id, delta: creditedExcess, type: 'OVERPAYMENT', refType: 'SALE', refId: sale.id, note: `Overpayment on ${sale.voucherNo}`, userId });
        }
      }

      return { sale: await getSale(tx, storeId, sale.id), changeReturned, creditedExcess };
    },
    { timeout: 30_000 },
  );
}

export async function voidSale(actor, id, reason) {
  const { storeId, id: userId } = actor;
  return prisma.$transaction(
    async (tx) => {
      const sale = await tx.sale.findFirst({ where: { id, storeId }, include: { items: true } });
      if (!sale) throw notFound('Voucher not found');
      if (sale.status === 'VOID') throw badRequest('This voucher is already void');

      for (const item of sale.items) {
        if (item.productUnitId) {
          await tx.productUnit.updateMany({ where: { id: item.productUnitId, status: 'SOLD' }, data: { status: 'IN_STOCK' } });
        }
        await adjustStock(tx, {
          storeId, productId: item.productId, warehouseId: sale.warehouseId, delta: item.quantity,
          type: 'VOID_RETURN', refType: 'SALE', refId: sale.id, note: `Void ${sale.voucherNo}`, userId,
        });
      }

      // Everything the customer settled on this voucher goes back to their credit balance
      let refundedToCredit = ZERO;
      if (sale.customerId && sale.paidAmount.gt(0)) {
        await adjustCredit(tx, {
          storeId, customerId: sale.customerId, delta: sale.paidAmount, type: 'VOID_REFUND',
          refType: 'SALE', refId: sale.id, note: `Void ${sale.voucherNo}`, userId,
        });
        refundedToCredit = sale.paidAmount;
      }

      await tx.sale.update({
        where: { id: sale.id },
        data: { status: 'VOID', dueAmount: ZERO, voidedAt: new Date(), voidReason: reason },
      });
      return { sale: await getSale(tx, storeId, sale.id), refundedToCredit, cashRefundDue: sale.customerId ? ZERO : sale.paidAmount };
    },
    { timeout: 30_000 },
  );
}

// ── POS helpers ──

export async function lookupCode(storeId, code, warehouseId) {
  const unit = await prisma.productUnit.findFirst({
    where: { storeId, serialNumber: code },
    include: { product: true, saleItem: { select: { sale: { select: { voucherNo: true } } } } },
  });
  if (unit) {
    if (unit.status === 'SOLD') throw new AppError(409, `Serial ${unit.serialNumber} was already sold${unit.saleItem ? ` (${unit.saleItem.sale.voucherNo})` : ''}`);
    if (unit.status !== 'IN_STOCK') throw new AppError(409, `Serial ${unit.serialNumber} is marked ${unit.status.toLowerCase()}`);
    if (warehouseId && unit.warehouseId !== warehouseId) throw new AppError(409, `Serial ${unit.serialNumber} is in a different warehouse`);
    if (!unit.product.isActive) throw new AppError(409, 'This product is inactive');
    const { product, saleItem, ...u } = unit;
    return { kind: 'unit', product: await withAvailable(product, warehouseId), unit: u };
  }
  const product = await prisma.product.findFirst({
    where: { storeId, isActive: true, OR: [{ barcode: code }, { sku: code }] },
  });
  if (!product) throw notFound('No product or serial number matches that code');
  return { kind: 'product', product: await withAvailable(product, warehouseId) };
}

async function withAvailable(product, warehouseId) {
  let available = product.totalStock;
  if (warehouseId) {
    const level = await prisma.stockLevel.findUnique({ where: { productId_warehouseId: { productId: product.id, warehouseId } } });
    available = level?.quantity ?? 0;
  }
  return { ...product, available };
}

export async function searchProducts(storeId, q, warehouseId) {
  const rows = await prisma.product.findMany({
    where: { storeId, isActive: true, OR: [{ name: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }] },
    orderBy: { name: 'asc' },
    take: 10,
    include: { stock: warehouseId ? { where: { warehouseId } } : true },
  });
  return rows.map(({ stock, ...p }) => ({
    ...p,
    available: warehouseId ? (stock[0]?.quantity ?? 0) : p.totalStock,
  }));
}

export async function availableUnits(storeId, productId, warehouseId) {
  return prisma.productUnit.findMany({
    where: { storeId, productId, warehouseId, status: 'IN_STOCK' },
    select: { id: true, serialNumber: true },
    orderBy: { serialNumber: 'asc' },
    take: 500,
  });
}
