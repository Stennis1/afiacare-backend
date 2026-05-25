import { z } from 'zod';
import { NotificationStatus } from '@prisma/client';

export const listNotificationsQuerySchema = z.object({
  // z.nativeEnum maps a Prisma enum directly — zero drift if we add a
  // status value later. Optional: omit to get all statuses.
  status: z.nativeEnum(NotificationStatus).optional(),
  alertId: z.string().min(1).optional(),
  // Query strings are always string-typed; coerce + clamp. Bounds match
  // the service-side DEFAULT_LIMIT (50) / MAX_LIMIT (200).
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
