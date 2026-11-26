// Gap-free per-store sequences (VCH-000001, PAY-000001, WTY-000001).
// Must be called inside a transaction so a rollback also rolls back the number.
export async function nextNumber(tx, storeId, key, prefix, pad = 6) {
  const row = await tx.counter.upsert({
    where: { storeId_key: { storeId, key } },
    update: { value: { increment: 1 } },
    create: { storeId, key, value: 1 },
  });
  return `${prefix}-${String(row.value).padStart(pad, '0')}`;
}
