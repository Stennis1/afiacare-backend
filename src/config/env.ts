import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  // Comma-separated phone list for escalation. Empty by default so the
  // server boots in fresh checkouts; in demo, point at a teammate's phone.
  // Used by escalation.service for both SMS recipients and voice <Dial>
  // bridgeToNumbers — same list, same env var, both side effects.
  ESCALATION_CHW_PHONES: z
    .string()
    .default('')
    .transform((s) => s.split(',').map((p) => p.trim()).filter(Boolean)),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[env] Invalid environment variables:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
