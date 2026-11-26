import { Router } from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import multer from 'multer';
import { z } from 'zod';
import { env } from '../../core/env.js';
import { asyncHandler, validate } from '../../core/http.js';
import { requirePermission } from '../../core/auth.js';
import { badRequest } from '../../core/errors.js';
import * as svc from './service.js';

const router = Router();

const EXT = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' };

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.resolve(env.UPLOAD_DIR, 'logos');
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    // extension comes from the verified mimetype, never from the client-supplied name
    filename: (req, file, cb) => cb(null, `${req.user.storeId}-${crypto.randomBytes(8).toString('hex')}${EXT[file.mimetype]}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (EXT[file.mimetype] ? cb(null, true) : cb(badRequest('Logo must be a PNG, JPG or WebP image'))),
});

const profileSchema = z.object({
  name: z.string().trim().min(1).max(150),
  address: z.string().trim().max(1000).optional().nullable().transform((v) => v || null),
  phone: z.string().trim().max(40).optional().nullable().transform((v) => v || null),
  email: z.string().trim().email().max(150).optional().nullable().or(z.literal('')).transform((v) => v || null),
  voucherNotes: z.string().trim().max(2000).optional().nullable().transform((v) => v || null),
  currency: z.string().trim().min(1).max(8).default('BDT'),
});

router.get('/profile', asyncHandler(async (req, res) => res.json(await svc.getProfile(req.user.storeId))));

router.put(
  '/profile',
  requirePermission('store.manage'),
  validate({ body: profileSchema }),
  asyncHandler(async (req, res) => res.json(await svc.updateProfile(req.user.storeId, req.body))),
);

router.post(
  '/logo',
  requirePermission('store.manage'),
  upload.single('logo'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No file uploaded');
    res.json(await svc.setLogo(req.user.storeId, `logos/${req.file.filename}`));
  }),
);

router.delete(
  '/logo',
  requirePermission('store.manage'),
  asyncHandler(async (req, res) => res.json(await svc.clearLogo(req.user.storeId))),
);

export default {
  name: 'stores',
  label: 'Store',
  path: 'store',
  scope: 'store',
  permissions: [{ key: 'store.manage', label: 'Edit store profile & voucher settings' }],
  router,
};
