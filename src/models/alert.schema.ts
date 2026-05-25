import { z } from 'zod';

export const patchAlertSchema = z.object({
  action: z.enum(['acknowledge', 'resolve']),
});

export type PatchAlertBody = z.infer<typeof patchAlertSchema>;
