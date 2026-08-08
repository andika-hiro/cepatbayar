import { z } from 'zod';

export const isoDateSchema = z
  .string()
  .refine(
    (val) =>
      /^\d{4}-\d{2}-\d{2}$/.test(val) &&
      !Number.isNaN(Date.parse(val)) &&
      new Date(val).toISOString().slice(0, 10) === val,
    { message: 'invalid_date' },
  );
