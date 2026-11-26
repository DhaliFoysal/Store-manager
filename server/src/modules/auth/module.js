import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env, isProd } from '../../core/env.js';
import { asyncHandler, validate, zPassword } from '../../core/http.js';
import { authenticate } from '../../core/auth.js';
import * as svc from './service.js';

const router = Router();

const limiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please try again later.' },
});

const COOKIE = 'rt';
const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'strict',
  path: '/api/auth',
  maxAge: env.REFRESH_TTL_DAYS * 86_400_000,
};

function sendSession(res, { refreshToken, ...session }, status = 200) {
  res.cookie(COOKIE, refreshToken, cookieOptions);
  res.status(status).json(session);
}

const email = z.string().trim().toLowerCase().email().max(190);
const phone = z.string().trim().max(40).optional().nullable().transform((v) => v || null);
const resetCode = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code');

router.post(
  '/register',
  limiter,
  validate({
    body: z.object({
      storeName: z.string().trim().min(2).max(150),
      name: z.string().trim().min(2).max(120),
      email,
      phone,
      password: zPassword,
    }),
  }),
  asyncHandler(async (req, res) => {
    await svc.register(req.body);
    res.status(201).json({ message: 'Registration received. You will be able to sign in once an administrator approves your account.' });
  }),
);

router.post(
  '/login',
  limiter,
  validate({ body: z.object({ email, password: z.string().min(1).max(72) }) }),
  asyncHandler(async (req, res) => sendSession(res, await svc.login(req.body.email, req.body.password))),
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    try {
      sendSession(res, await svc.refresh(req.cookies?.[COOKIE]));
    } catch (e) {
      res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
      throw e;
    }
  }),
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await svc.logout(req.cookies?.[COOKIE]);
    res.clearCookie(COOKIE, { ...cookieOptions, maxAge: undefined });
    res.json({ ok: true });
  }),
);

router.get('/me', authenticate, asyncHandler(async (req, res) => res.json(await svc.buildSession(req.user.id))));

router.put(
  '/me',
  authenticate,
  validate({ body: z.object({ name: z.string().trim().min(2).max(120), phone }) }),
  asyncHandler(async (req, res) => res.json(await svc.updateMe(req.user.id, req.body))),
);

router.post(
  '/change-password',
  authenticate,
  validate({ body: z.object({ currentPassword: z.string().min(1).max(72), newPassword: zPassword }) }),
  asyncHandler(async (req, res) =>
    sendSession(res, await svc.changePassword(req.user.id, req.body.currentPassword, req.body.newPassword)),
  ),
);

// 1) e-mail a 6-digit code
router.post(
  '/forgot-password',
  limiter,
  validate({ body: z.object({ email }) }),
  asyncHandler(async (req, res) => {
    await svc.forgotPassword(req.body.email);
    res.json({ message: 'If that e-mail belongs to an active account, a 6-digit code has been sent.' });
  }),
);

// 2) check the code (does not consume it)
router.post(
  '/verify-reset-code',
  limiter,
  validate({ body: z.object({ email, code: resetCode }) }),
  asyncHandler(async (req, res) => {
    await svc.verifyResetCode(req.body.email, req.body.code);
    res.json({ ok: true });
  }),
);

// 3) set the new password with the same code
router.post(
  '/reset-password',
  limiter,
  validate({ body: z.object({ email, code: resetCode, password: zPassword }) }),
  asyncHandler(async (req, res) => {
    await svc.resetPassword(req.body.email, req.body.code, req.body.password);
    res.json({ message: 'Password updated. You can now sign in.' });
  }),
);

export default {
  name: 'auth',
  path: 'auth',
  scope: 'public', // individual routes opt in to authenticate
  dependsOn: ['stores'],
  permissions: [],
  router,
};
