import type { Request, Response } from 'express';
import { Channel, Role } from '@prisma/client';
import * as riskService from '../services/risk.service';
import * as patientService from '../services/patient.service';
import { ApiError } from '../utils/api-error';
import type { RiskCheckBody } from '../models/risk.schema';

/**
 * POST /api/risk/check
 *
 * Patient resolution:
 *   - PATIENT: always acts on self. Any patientId in body is IGNORED
 *     (prevents impersonation). Auto-creates an empty profile if missing.
 *   - CHW / ADMIN: must supply body.patientId; we 404 if it doesn't exist.
 *
 * DHO is excluded at the route layer — they get aggregates, not the
 * triage button.
 */
export async function check(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const body = req.body as RiskCheckBody;

  let targetPatientId: string;

  if (req.user.role === Role.PATIENT) {
    const profile = await patientService.ensureProfileForUser(req.user.id);
    targetPatientId = profile.id;
  } else {
    // requireRole at the route layer guarantees CHW or ADMIN here.
    if (!body.patientId) {
      throw ApiError.badRequest('patientId is required when acting on a patient');
    }
    const profile = await patientService.getPatientById(body.patientId);
    targetPatientId = profile.id;
  }

  // Web doesn't consume the escalation outcome (no live call to bridge);
  // discard it. The dashboard alert + SMS still fire as side effects.
  const { result } = await riskService.assessAndRecord({
    patientId: targetPatientId,
    symptoms: body.symptoms,
    channel: Channel.WEB,
  });

  res.json(result);
}
