import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env, isProd } from './core/env.js';
import { loadModules } from './core/moduleLoader.js';
import { errorHandler, notFoundHandler } from './core/errors.js';
import { authenticate } from './core/auth.js';
import { allPermissions } from './core/permissions.js';

export async function createApp() {
  const app = express();
  if (env.TRUST_PROXY) app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' }, // logos are loaded by the SPA
    }),
  );
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (!isProd) app.use(morgan('dev'));
  else app.use(morgan('combined'));

  app.use('/api', rateLimit({ windowMs: 60_000, limit: 600, standardHeaders: true, legacyHeaders: false }));

  const uploadRoot = path.resolve(env.UPLOAD_DIR);
  fs.mkdirSync(path.join(uploadRoot, 'logos'), { recursive: true });
  app.use('/uploads', express.static(uploadRoot, { maxAge: '7d', index: false, dotfiles: 'deny' }));

  app.get('/api/health', (req, res) => res.json({ ok: true }));

  const modules = await loadModules(app);

  // Lets the UI build the permission checklist from whatever modules are installed
  app.get('/api/meta/permissions', authenticate, (req, res) => res.json({ permissions: allPermissions() }));
  app.get('/api/meta/modules', authenticate, (req, res) =>
    res.json({ modules: modules.map((m) => ({ name: m.name, path: m.path || m.name })) }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
