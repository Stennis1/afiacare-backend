import { Router } from 'express';
import * as notificationController from '../controllers/notification.controller';
import { validateQuery } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/async-handler';
import { listNotificationsQuerySchema } from '../models/notification.schema';

export const notificationRouter = Router();

// Dashboard read endpoint per §8 — surfaces the simulated SMS log so a
// CHW/DHO/ADMIN can see what notifications went out. Read-only; sending
// is internal (escalation.service calls notification.service.send).
notificationRouter.get(
  '/',
  requireAuth,
  requireRole('CHW', 'DHO', 'ADMIN'),
  validateQuery(listNotificationsQuerySchema),
  asyncHandler(notificationController.list),
);
