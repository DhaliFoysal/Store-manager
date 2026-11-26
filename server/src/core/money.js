import { Prisma } from '@prisma/client';
import { z } from 'zod';

// All money maths uses Decimal – never JS floats.
export const Decimal = Prisma.Decimal;
export const D = (v) => new Decimal(v ?? 0);
export const ZERO = new Decimal(0);

export const zMoney = z.coerce.number().multipleOf(0.01, 'At most 2 decimal places').min(0).max(999999999);
export const zPosMoney = zMoney.refine((v) => v > 0, 'Must be greater than 0');
