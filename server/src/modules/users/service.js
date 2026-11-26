import { Prisma } from '@prisma/client';
import { prisma } from '../../core/db.js';
import { badRequest, forbidden, notFound, conflict } from '../../core/errors.js';
import { allPermissionKeys } from '../../core/permissions.js';
import { hashPassword } from '../../core/password.js';

const select = {
  id: true, name: true, email: true, phone: true, role: true, status: true,
  permissions: true, lastLoginAt: true, createdAt: true,
};

async function revokeSessions(userId) {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

// Owner manages Admins + Users. Admin manages Users only. Nobody edits the Owner here.
function assertCanAssignRole(actor, role) {
  if (actor.role === 'OWNER') return;
  if (actor.role === 'ADMIN' && role === 'USER') return;
  throw forbidden('You can only create users with the "User" role');
}

async function loadManageable(actor, id) {
  const target = await prisma.user.findFirst({ where: { id, storeId: actor.storeId }, select: { ...select, storeId: true } });
  if (!target) throw notFound('User not found');
  if (target.role === 'OWNER') throw forbidden('The store owner cannot be modified here');
  if (actor.role === 'ADMIN' && target.role !== 'USER') throw forbidden('Admins can only manage users with the "User" role');
  return target;
}

function cleanPermissions(role, permissions) {
  if (role !== 'USER') return null; // owner/admin permissions are derived from the role
  const valid = new Set(allPermissionKeys());
  const unknown = (permissions || []).filter((p) => !valid.has(p));
  if (unknown.length) throw badRequest(`Unknown permission(s): ${unknown.join(', ')}`);
  return [...new Set(permissions || [])];
}

export async function list(storeId, { q, role, status }) {
  return prisma.user.findMany({
    where: {
      storeId,
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ name: { contains: q } }, { email: { contains: q } }, { phone: { contains: q } }] } : {}),
    },
    select,
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
}

export async function create(actor, data) {
  assertCanAssignRole(actor, data.role);
  if (await prisma.user.findUnique({ where: { email: data.email } })) throw conflict('A user with this e-mail already exists');
  return prisma.user.create({
    data: {
      storeId: actor.storeId,
      name: data.name,
      email: data.email,
      phone: data.phone,
      role: data.role,
      status: data.status,
      permissions: cleanPermissions(data.role, data.permissions) ?? undefined,
      passwordHash: await hashPassword(data.password),
    },
    select,
  });
}

export async function update(actor, id, data) {
  const target = await loadManageable(actor, id);
  const self = target.id === actor.id;
  if (self && (data.status || data.role)) throw badRequest('You cannot change your own role or status');
  if (data.role) assertCanAssignRole(actor, data.role);

  const role = data.role ?? target.role;
  const patch = {
    ...(data.name !== undefined ? { name: data.name } : {}),
    ...(data.phone !== undefined ? { phone: data.phone } : {}),
    ...(data.status ? { status: data.status } : {}),
    ...(data.role ? { role: data.role } : {}),
  };
  if (data.permissions !== undefined || data.role) {
    // Json columns need Prisma.DbNull (not a bare null) to be cleared
    patch.permissions = role === 'USER' ? cleanPermissions(role, data.permissions ?? target.permissions) : Prisma.DbNull;
  }
  const updated = await prisma.user.update({ where: { id }, data: patch, select });
  if (data.status && data.status !== 'ACTIVE') await revokeSessions(id);
  return updated;
}

export async function setPassword(actor, id, password) {
  if (id === actor.id) throw badRequest('Use "Change password" in My Account to change your own password');
  await loadManageable(actor, id);
  await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(password) } });
  await revokeSessions(id);
}

export async function remove(actor, id) {
  if (id === actor.id) throw badRequest('You cannot delete your own account');
  await loadManageable(actor, id);
  // Fails with P2003 (-> 409 "deactivate instead") when the user has sales/payments on record
  await prisma.user.delete({ where: { id } });
}
