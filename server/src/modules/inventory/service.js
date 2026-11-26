import { prisma } from '../../core/db.js';
import { AppError, badRequest, notFound } from '../../core/errors.js';
import { D } from '../../core/money.js';

/**
 * The ONLY function that changes stock quantities. Keeps StockLevel (per warehouse),
 * Product.totalStock and the StockMovement audit trail in step. Run inside a transaction.
 */
export async function adjustStock(tx, { storeId, productId, warehouseId, delta, type, refType = null, refId = null, note = null, userId = null, label = 'this product' }) {
  if (!delta) return;
  if (delta < 0) {
    const res = await tx.stockLevel.updateMany({
      where: { productId, warehouseId, quantity: { gte: -delta } },
      data: { quantity: { decrement: -delta } },
    });
    if (res.count === 0) throw new AppError(409, `Insufficient stock for ${label}`);
  } else {
    await tx.stockLevel.upsert({
      where: { productId_warehouseId: { productId, warehouseId } },
      create: { productId, warehouseId, quantity: delta },
      update: { quantity: { increment: delta } },
    });
  }
  await tx.product.update({ where: { id: productId }, data: { totalStock: { increment: delta } } });
  await tx.stockMovement.create({ data: { storeId, productId, warehouseId, type, quantity: delta, refType, refId, note, userId } });
}

const cleanSerials = (serials = []) => {
  const list = serials.map((s) => s.trim()).filter(Boolean);
  const unique = new Set(list.map((s) => s.toLowerCase()));
  if (unique.size !== list.length) throw badRequest('The serial number list contains duplicates');
  return list;
};

async function loadProduct(tx, storeId, productId) {
  const product = await tx.product.findFirst({ where: { id: productId, storeId } });
  if (!product) throw notFound('Product not found');
  return product;
}

async function loadWarehouse(tx, storeId, warehouseId, { activeOnly = true } = {}) {
  const wh = await tx.warehouse.findFirst({ where: { id: warehouseId, storeId, ...(activeOnly ? { isActive: true } : {}) } });
  if (!wh) throw notFound('Warehouse not found or inactive');
  return wh;
}

export async function receiveStock(tx, { storeId, userId, productId, warehouseId, quantity, serials, costPrice, note }) {
  const product = await loadProduct(tx, storeId, productId);
  await loadWarehouse(tx, storeId, warehouseId);

  let qty;
  if (product.trackSerial) {
    const list = cleanSerials(serials);
    if (!list.length) throw badRequest(`"${product.name}" is serial-tracked: enter at least one serial number`);
    const existing = await tx.productUnit.findMany({ where: { storeId, serialNumber: { in: list } }, select: { serialNumber: true } });
    if (existing.length) {
      throw new AppError(409, `Serial number already in the system: ${existing.slice(0, 5).map((e) => e.serialNumber).join(', ')}${existing.length > 5 ? '…' : ''}`);
    }
    await tx.productUnit.createMany({ data: list.map((serialNumber) => ({ storeId, productId, warehouseId, serialNumber })) });
    qty = list.length;
  } else {
    qty = quantity;
    if (!qty || qty < 1) throw badRequest('Quantity must be at least 1');
  }

  await adjustStock(tx, { storeId, productId, warehouseId, delta: qty, type: 'RECEIVE', note, userId });
  if (costPrice != null) await tx.product.update({ where: { id: productId }, data: { costPrice: D(costPrice) } });
  return { received: qty };
}

export async function adjustManually(tx, { storeId, userId, productId, warehouseId, delta, note }) {
  const product = await loadProduct(tx, storeId, productId);
  if (product.trackSerial) throw badRequest('Serial-tracked products are adjusted per unit (mark a serial defective/lost)');
  await loadWarehouse(tx, storeId, warehouseId, { activeOnly: false });
  await adjustStock(tx, { storeId, productId, warehouseId, delta, type: 'ADJUST', note, userId, label: product.name });
}

export async function transfer(tx, { storeId, userId, productId, fromWarehouseId, toWarehouseId, quantity, serials, note }) {
  if (fromWarehouseId === toWarehouseId) throw badRequest('Choose two different warehouses');
  const product = await loadProduct(tx, storeId, productId);
  await loadWarehouse(tx, storeId, fromWarehouseId, { activeOnly: false });
  await loadWarehouse(tx, storeId, toWarehouseId);

  let qty;
  if (product.trackSerial) {
    const list = cleanSerials(serials);
    if (!list.length) throw badRequest('Select the serial numbers to transfer');
    const units = await tx.productUnit.findMany({
      where: { storeId, productId, warehouseId: fromWarehouseId, status: 'IN_STOCK', serialNumber: { in: list } },
    });
    if (units.length !== list.length) throw new AppError(409, 'Some serial numbers are not in stock in the source warehouse');
    const moved = await tx.productUnit.updateMany({
      where: { id: { in: units.map((u) => u.id) }, status: 'IN_STOCK', warehouseId: fromWarehouseId },
      data: { warehouseId: toWarehouseId },
    });
    if (moved.count !== units.length) throw new AppError(409, 'Stock changed while transferring, please retry');
    qty = units.length;
  } else {
    qty = quantity;
    if (!qty || qty < 1) throw badRequest('Quantity must be at least 1');
  }

  const common = { storeId, productId, note, userId, label: product.name };
  await adjustStock(tx, { ...common, warehouseId: fromWarehouseId, delta: -qty, type: 'TRANSFER_OUT' });
  await adjustStock(tx, { ...common, warehouseId: toWarehouseId, delta: qty, type: 'TRANSFER_IN' });
  return { moved: qty };
}

// IN_STOCK <-> DEFECTIVE / LOST for a single serial-tracked unit
export async function setUnitStatus(tx, { storeId, userId, unitId, status, note }) {
  const unit = await tx.productUnit.findFirst({ where: { id: unitId, storeId }, include: { product: true } });
  if (!unit) throw notFound('Unit not found');
  if (unit.status === 'SOLD') throw badRequest('This unit has been sold');
  if (unit.status === status) return unit;

  const wasInStock = unit.status === 'IN_STOCK';
  const willBeInStock = status === 'IN_STOCK';
  if (wasInStock !== willBeInStock) {
    await adjustStock(tx, {
      storeId, productId: unit.productId, warehouseId: unit.warehouseId,
      delta: willBeInStock ? 1 : -1, type: 'ADJUST', note: note || `Serial ${unit.serialNumber} marked ${status}`, userId, label: unit.product.name,
    });
  }
  return tx.productUnit.update({ where: { id: unit.id }, data: { status } });
}

export const runTx = (fn) => prisma.$transaction(fn, { timeout: 20_000 });
