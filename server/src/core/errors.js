import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { isProd } from './env.js';

export class AppError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (m, d) => new AppError(400, m, d);
export const unauthorized = (m = 'Authentication required') => new AppError(401, m);
export const forbidden = (m = 'You do not have permission to do that') => new AppError(403, m);
export const notFound = (m = 'Not found') => new AppError(404, m);
export const conflict = (m, d) => new AppError(409, m, d);

export function notFoundHandler(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ message: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    const first = details[0];
    return res.status(400).json({
      message: first ? `${first.path ? first.path + ': ' : ''}${first.message}` : 'Validation failed',
      details,
    });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : err.meta?.target;
      return res.status(409).json({ message: `A record with the same value already exists${target ? ` (${target})` : ''}` });
    }
    if (err.code === 'P2003') {
      return res.status(409).json({ message: 'This record is in use by other records and cannot be removed. Deactivate it instead.' });
    }
    if (err.code === 'P2025') return res.status(404).json({ message: 'Record not found' });
  }
  if (err?.name === 'MulterError') {
    return res.status(400).json({ message: err.code === 'LIMIT_FILE_SIZE' ? 'File is too large (max 2 MB)' : err.message });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ message: 'Malformed JSON body' });

  console.error(err);
  res.status(500).json({ message: isProd ? 'Internal server error' : err.message });
}
