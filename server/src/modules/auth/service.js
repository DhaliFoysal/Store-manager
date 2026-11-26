import jwt from 'jsonwebtoken';
import { prisma } from '../../core/db.js';
import { env } from '../../core/env.js';
import { AppError, conflict, unauthorized, badRequest } from '../../core/errors.js';
import { resolvePermissions } from '../../core/permissions.js';
import { DUMMY_HASH, hashPassword, randomToken, sha256, verifyPassword } from '../../core/password.js';
import { sendMail } from '../../core/mailer.js';
import { publicStore } from '../stores/service.js';

const DAY = 86_400_000;

export async function register({ storeName, name, email, phone, password }) {
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw conflict('An account with this e-mail already exists');
  const passwordHash = await hashPassword(password);
  // Both rows start as PENDING; the platform admin activates them (see platform module)
  await prisma.store.create({
    data: {
      name: storeName,
      phone,
      status: 'PENDING',
      users: { create: { name, email, phone, passwordHash, role: 'OWNER', status: 'PENDING' } },
    },
  });
}

export async function buildSession(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { store: true } });
  if (!user) throw unauthorized();
  return {
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, status: user.status },
    permissions: resolvePermissions(user),
    store: publicStore(user.store),
  };
}

async function issueTokens(userId, role) {
  const accessToken = jwt.sign({ sub: userId, role }, env.JWT_ACCESS_SECRET, { expiresIn: env.ACCESS_TTL });
  const refreshToken = randomToken();
  await prisma.refreshToken.create({
    data: { userId, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * DAY) },
  });
  return { accessToken, refreshToken };
}

function assertCanSignIn(user) {
  if (user.status === 'PENDING') throw new AppError(403, 'Your registration is awaiting admin approval');
  if (user.status === 'REJECTED') throw new AppError(403, 'Your registration was not approved');
  if (user.status === 'INACTIVE') throw new AppError(403, 'This account is deactivated. Contact your store owner');
  if (user.role !== 'SUPER_ADMIN' && user.store?.status !== 'ACTIVE') {
    throw new AppError(403, 'This store is not active. Contact support');
  }
}

export async function login(email, password) {
  const user = await prisma.user.findUnique({ where: { email }, include: { store: true } });
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw unauthorized('Invalid e-mail or password');
  assertCanSignIn(user);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const tokens = await issueTokens(user.id, user.role);
  return { ...tokens, ...(await buildSession(user.id)) };
}

export async function revokeAllSessions(userId) {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function refresh(rawToken) {
  if (!rawToken) throw unauthorized();
  const rec = await prisma.refreshToken.findUnique({
    where: { tokenHash: sha256(rawToken) },
    include: { user: { include: { store: true } } },
  });
  if (!rec) throw unauthorized();
  if (rec.revokedAt) {
    // A rotated token being replayed long after rotation looks like theft: kill every session.
    // (A short grace window tolerates two browser tabs refreshing simultaneously.)
    if (Date.now() - rec.revokedAt.getTime() > 60_000) await revokeAllSessions(rec.userId);
    throw unauthorized('Session expired');
  }
  if (rec.expiresAt < new Date()) throw unauthorized('Session expired');
  assertCanSignIn(rec.user);

  const claimed = await prisma.refreshToken.updateMany({
    where: { id: rec.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (claimed.count !== 1) throw unauthorized('Session expired');

  const tokens = await issueTokens(rec.userId, rec.user.role);
  return { ...tokens, ...(await buildSession(rec.userId)) };
}

export async function logout(rawToken) {
  if (!rawToken) return;
  await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function updateMe(userId, { name, phone }) {
  await prisma.user.update({ where: { id: userId }, data: { name, phone } });
  return buildSession(userId);
}

export async function changePassword(userId, currentPassword, newPassword) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) throw badRequest('Current password is incorrect');
  if (currentPassword === newPassword) throw badRequest('New password must be different from the current one');
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
  await revokeAllSessions(userId); // sign out every other device
  const tokens = await issueTokens(userId, user.role);
  return { ...tokens, ...(await buildSession(userId)) };
}

export async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== 'ACTIVE') return; // same response either way
  const token = randomToken(32);
  await prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60 * 60_000) },
  });
  const link = `${env.CLIENT_URL}/reset-password?token=${token}`;
  await sendMail({
    to: user.email,
    subject: 'Reset your password',
    text: `Hello ${user.name},\n\nUse the link below to choose a new password. It is valid for 1 hour.\n\n${link}\n\nIf you did not request this, you can ignore this e-mail.`,
  });
}

export async function resetPassword(token, newPassword) {
  const rec = await prisma.passwordReset.findUnique({ where: { tokenHash: sha256(token) } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) throw badRequest('This reset link is invalid or has expired');
  await prisma.$transaction([
    prisma.passwordReset.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: rec.userId }, data: { passwordHash: await hashPassword(newPassword) } }),
    prisma.refreshToken.updateMany({ where: { userId: rec.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}
