import jwt from "jsonwebtoken";
import { prisma } from "./db.js";
import { env } from "./env.js";
import { AppError, forbidden, unauthorized } from "./errors.js";
import { resolvePermissions } from "./permissions.js";

// Verifies the bearer token and reloads the user on EVERY request, so deactivating a
// user or suspending a store takes effect immediately (not after the token expires).
export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw unauthorized();

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    } catch {
      throw unauthorized("Session expired");
    }

    const user = await prisma.user.findUnique({
      where: { id: Number(payload.sub) },
      include: { store: { select: { id: true, status: true } } },
    });
    if (!user || user.status !== "ACTIVE")
      throw unauthorized("Account is not active");
    if (user.role !== "SUPER_ADMIN" && user.store?.status !== "ACTIVE") {
      throw new AppError(403, "This store is not active");
    }

    req.user = {
      id: user.id,
      storeId: user.storeId,
      role: user.role,
      name: user.name,
      email: user.email,
      permissions: resolvePermissions(user),
    };
    next();
  } catch (e) {
    next(e);
  }
}

// Store-scoped routes: the caller must belong to a store (excludes the platform super admin)
export function requireStore(req, res, next) {
  if (!req.user?.storeId)
    return next(forbidden("This area is for store accounts"));
  next();
}

export const requirePermission =
  (...keys) =>
  (req, res, next) => {
    const have = req.user?.permissions || [];
    if (keys.every((k) => have.includes(k))) return next();
    next(forbidden());
  };

export const requireAnyPermission =
  (...keys) =>
  (req, res, next) => {
    const have = req.user?.permissions || [];
    if (keys.some((k) => have.includes(k))) return next();
    next(forbidden());
  };

export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user?.role) ? next() : next(forbidden());
