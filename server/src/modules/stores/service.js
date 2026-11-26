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

// Called when the platform admin approves a store (and by the seed script)
export async function provisionStore(tx, storeId) {
  const count = await tx.warehouse.count({ where: { storeId } });
  if (!count) await tx.warehouse.create({ data: { storeId, name: 'Main Warehouse', isDefault: true } });
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
