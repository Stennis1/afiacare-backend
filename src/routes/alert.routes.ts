import { Router } from 'express';
import * as alertController from '../controllers/alert.controller';
import { validateBody } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/async-handler';
import { patchAlertSchema } from '../models/alert.schema';

export const alertRouter = Router();

// DHO can READ the alerts dashboard (population oversight)...
alertRouter.get(
  '/',
  requireAuth,
  requireRole('CHW', 'DHO', 'ADMIN'),
  asyncHandler(alertController.list),
);

// ...but only CHW/ADMIN can take ACTION on an alert (acknowledge/resolve).
// DHO is read-only by design — they observe, they don't triage.
alertRouter.patch(
  '/:id',
  requireAuth,
  requireRole('CHW', 'ADMIN'),
  validateBody(patchAlertSchema),
  asyncHandler(alertController.patch),
);
