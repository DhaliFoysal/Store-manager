import crypto from 'node:crypto';
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

// ───────── password reset by 6-digit e-mailed code ─────────
const RESET_TTL_MS = 10 * 60_000; // code is valid for 10 minutes
const RESET_MAX_ATTEMPTS = 5; // wrong guesses before the code is dead
const RESET_RESEND_GAP_MS = 60_000; // one new code per minute

// the code alone is only 6 digits, so it is bound to the user id and a server secret before hashing
const codeHash = (userId, code) => sha256(`${env.JWT_ACCESS_SECRET}:${userId}:${code}`);

export async function forgotPassword(email) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== 'ACTIVE') return; // same response either way
  const recent = await prisma.passwordReset.findFirst({
    where: { userId: user.id, usedAt: null, createdAt: { gt: new Date(Date.now() - RESET_RESEND_GAP_MS) } },
  });
  if (recent) return;

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.passwordReset.create({
    data: { userId: user.id, tokenHash: codeHash(user.id, code), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  await sendMail({
    to: user.email,
    subject: `Your password reset code: ${code}`,
    text: `Hello ${user.name},\n\nYour verification code is:\n\n    ${code}\n\nIt is valid for 10 minutes. Enter it on the reset page to choose a new password.\n\nIf you did not request this, you can ignore this e-mail.`,
  });
}

// Validates the code without consuming it. Wrong guesses are counted; after 5 the code is dead.
async function checkResetCode(email, code) {
  const fail = () => badRequest('This code is invalid or has expired');
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw fail();
  const rec = await prisma.passwordReset.findFirst({ where: { userId: user.id, usedAt: null }, orderBy: { id: 'desc' } });
  if (!rec || rec.expiresAt < new Date() || rec.attempts >= RESET_MAX_ATTEMPTS) throw fail();
  if (rec.tokenHash !== codeHash(user.id, code)) {
    await prisma.passwordReset.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } } });
    throw fail();
  }
  return rec;
}

export async function verifyResetCode(email, code) {
  await checkResetCode(email, code);
}

export async function resetPassword(email, code, newPassword) {
  const rec = await checkResetCode(email, code);
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.passwordReset.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({ where: { userId: rec.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}
