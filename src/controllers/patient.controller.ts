import type { Request, Response } from 'express';
import { Role } from '@prisma/client';
import * as patientService from '../services/patient.service';
import { ApiError } from '../utils/api-error';
import type { UpsertPatientBody } from '../models/patient.schema';

export async function upsertMine(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const body = req.body as UpsertPatientBody;
  const profile = await patientService.upsertOwnProfile(req.user.id, body);
  res.status(200).json({ profile });
}

export async function list(_req: Request, res: Response): Promise<void> {
  const patients = await patientService.listPatients();
  res.json({ patients });
}

export async function getById(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const targetUserId = req.params.id;
  if (!targetUserId) throw ApiError.badRequest('id is required');

  // requireRole can express "CHW or ADMIN" but not "CHW or ADMIN or self."
  // DHO is deliberately excluded from detail per §4 — they get aggregate
  // (list) but not individual records (population view, not clinical view).
  const isSelf = req.user.id === targetUserId;
  const isStaff = req.user.role === Role.CHW || req.user.role === Role.ADMIN;
  if (!isSelf && !isStaff) {
    throw ApiError.forbidden('Cannot view another patient');
  }

  const result = await patientService.getPatientByUserId(targetUserId);
  res.json(result);
}
