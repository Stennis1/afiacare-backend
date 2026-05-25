import { z } from 'zod';

// Every field optional — registering a patient profile before any clinical
// data is collected is a valid state. Each field is also independently
// updatable (PATCH-like semantics via POST upsert).
export const upsertPatientSchema = z.object({
  district: z.string().min(1).max(80).optional(),
  gestationalWeeks: z.number().int().min(0).max(44).optional(),
  lastMenstrualPeriod: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  parity: z.number().int().min(0).max(20).optional(),
  gravida: z.number().int().min(0).max(20).optional(),
  bloodGroup: z.string().min(1).max(5).optional(),
});

export type UpsertPatientBody = z.infer<typeof upsertPatientSchema>;
