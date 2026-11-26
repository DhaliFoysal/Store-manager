import { z } from 'zod';

export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// validate({ body, query, params }) – replaces each with the parsed (coerced / defaulted) value
export const validate = (schemas) => (req, res, next) => {
  try {
    for (const key of ['params', 'query', 'body']) {
      if (!schemas[key]) continue;
      const parsed = schemas[key].parse(req[key] ?? {});
      if (key === 'body') req.body = parsed;
      else Object.defineProperty(req, key, { value: parsed, writable: true, configurable: true });
    }
    next();
  } catch (e) {
    next(e);
  }
};

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const pageArgs = ({ page, limit }) => ({ skip: (page - 1) * limit, take: limit });
export const pageMeta = (page, limit, total) => ({ page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });

// "" -> undefined so optional query params can be sent blank from forms
export const emptyToUndef = (v) => (v === '' || v === null ? undefined : v);
export const optId = z.preprocess(emptyToUndef, z.coerce.number().int().positive().optional());
export const optStr = z.preprocess(emptyToUndef, z.string().trim().optional());
export const optBool = z.preprocess(
  (v) => (v === 'true' || v === '1' || v === true ? true : v === 'false' || v === '0' || v === false ? false : undefined),
  z.boolean().optional(),
);
export const optDate = z.preprocess(emptyToUndef, z.coerce.date().optional());

export const zPassword = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');
