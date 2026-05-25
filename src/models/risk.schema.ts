import { z } from 'zod';

// Mirrors SymptomInput in risk.service. Every field optional — partial USSD
// payloads must pass validation just like rich web payloads.
const symptomInputSchema = z.object({
  bleeding: z.boolean().optional(),
  severeHeadache: z.boolean().optional(),
  blurredVision: z.boolean().optional(),
  reducedFetalMovement: z.boolean().optional(),
  highBloodPressure: z.boolean().optional(),
  feverChills: z.boolean().optional(),
  swellingFaceHands: z.boolean().optional(),
  convulsions: z.boolean().optional(),
  gestationalWeeks: z.number().int().min(0).max(44).optional(),
  lang: z.enum(['en', 'tw', 'dag', 'ee']).optional(),
});

export const riskCheckSchema = z.object({
  patientId: z.string().cuid().optional(),
  symptoms: symptomInputSchema,
});

export type RiskCheckBody = z.infer<typeof riskCheckSchema>;
