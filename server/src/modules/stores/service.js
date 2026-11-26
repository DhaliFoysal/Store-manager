import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../../core/db.js';
import { env } from '../../core/env.js';
import { notFound } from '../../core/errors.js';

export const logoUrl = (store) => (store?.logoPath ? `/uploads/${store.logoPath}` : null);

export const publicStore = (s) =>
  s && {
    id: s.id,
    name: s.name,
    address: s.address,
    phone: s.phone,
    email: s.email,
    voucherNotes: s.voucherNotes,
    currency: s.currency,
    logoUrl: logoUrl(s),
  };

/**
 * Copies the super admin's default categories & warehouses into a store (only the ones it does not
 * have yet) and guarantees the store has exactly one default warehouse. Safe to run repeatedly.
 */
export async function applyDefaults(tx, storeId) {
  const [defCats, defWhs] = await Promise.all([
    tx.defaultCategory.findMany({ orderBy: { name: 'asc' } }),
    tx.defaultWarehouse.findMany({ orderBy: { id: 'asc' } }),
  ]);

  if (defCats.length) {
    const have = new Set((await tx.category.findMany({ where: { storeId }, select: { name: true } })).map((c) => c.name.toLowerCase()));
    const missing = defCats.filter((c) => !have.has(c.name.toLowerCase()));
    if (missing.length) {
      await tx.category.createMany({ data: missing.map((c) => ({ storeId, name: c.name, description: c.description })) });
    }
  }

  const existing = await tx.warehouse.findMany({ where: { storeId } });
  const haveWh = new Set(existing.map((w) => w.name.toLowerCase()));
  const missingWh = defWhs.filter((w) => !haveWh.has(w.name.toLowerCase()));
  if (missingWh.length) {
    await tx.warehouse.createMany({ data: missingWh.map((w) => ({ storeId, name: w.name, address: w.address, isDefault: false })) });
  }

  const all = await tx.warehouse.findMany({ where: { storeId }, orderBy: { id: 'asc' } });
  if (!all.length) {
    await tx.warehouse.create({ data: { storeId, name: 'Main Warehouse', isDefault: true } });
    return;
  }
  if (!all.some((w) => w.isDefault)) {
    const flagged = defWhs.find((w) => w.isDefault);
    const pick = (flagged && all.find((w) => w.name.toLowerCase() === flagged.name.toLowerCase())) || all[0];
    await tx.warehouse.update({ where: { id: pick.id }, data: { isDefault: true } });
  }
}

// Called when the platform admin approves a store (and by the seed script)
export async function provisionStore(tx, storeId) {
  await applyDefaults(tx, storeId);
  for (const key of ['VCH', 'PAY', 'WTY']) {
    await tx.counter.upsert({
      where: { storeId_key: { storeId, key } },
      update: {},
      create: { storeId, key, value: 0 },
    });
  }
}

export async function getProfile(storeId) {
  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) throw notFound('Store not found');
  return publicStore(store);
}

export async function updateProfile(storeId, data) {
  const store = await prisma.store.update({ where: { id: storeId }, data });
  return publicStore(store);
}

function removeFile(relPath) {
  if (!relPath) return;
  const root = path.resolve(env.UPLOAD_DIR);
  const full = path.resolve(root, relPath);
  if (full.startsWith(root + path.sep)) fs.promises.unlink(full).catch(() => {});
}

export async function setLogo(storeId, relPath) {
  const existing = await prisma.store.findUnique({ where: { id: storeId } });
  const store = await prisma.store.update({ where: { id: storeId }, data: { logoPath: relPath } });
  removeFile(existing?.logoPath);
  return publicStore(store);
}

export async function clearLogo(storeId) {
  const existing = await prisma.store.findUnique({ where: { id: storeId } });
  const store = await prisma.store.update({ where: { id: storeId }, data: { logoPath: null } });
  removeFile(existing?.logoPath);
  return publicStore(store);
}
