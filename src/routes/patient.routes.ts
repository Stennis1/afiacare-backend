import { Router } from 'express';
import * as patientController from '../controllers/patient.controller';
import { validateBody } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { asyncHandler } from '../utils/async-handler';
import { upsertPatientSchema } from '../models/patient.schema';

export const patientRouter = Router();

// Self-upsert. CHW/ADMIN on-behalf creation is deferred until a flow needs it.
patientRouter.post(
  '/',
  requireAuth,
  requireRole('PATIENT'),
  validateBody(upsertPatientSchema),
  asyncHandler(patientController.upsertMine),
);

patientRouter.get(
  '/',
  requireAuth,
  requireRole('CHW', 'DHO', 'ADMIN'),
  asyncHandler(patientController.list),
);

// Per-record detail: CHW/ADMIN or the patient themselves. Self-check inside
// the controller because requireRole alone can't express "or self."
patientRouter.get(
  '/:id',
  requireAuth,
  asyncHandler(patientController.getById),
);
