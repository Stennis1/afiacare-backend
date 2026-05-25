import { Router } from 'express';
import * as riskController from '../controllers/risk.controller';
import { validateBody } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/async-handler';
import { riskCheckSchema } from '../models/risk.schema';

export const riskRouter = Router();

// PATIENT can check on self; CHW/ADMIN can check on a named patient.
// DHO has no clinical action; excluded.
riskRouter.post(
  '/check',
  requireAuth,
  requireRole('PATIENT', 'CHW', 'ADMIN'),
  validateBody(riskCheckSchema),
  asyncHandler(riskController.check),
);
