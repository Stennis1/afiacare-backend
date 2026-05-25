import type { Request, Response } from 'express';
import { AlertStatus } from '@prisma/client';
import * as alertService from '../services/alert.service';
import { ApiError } from '../utils/api-error';
import type { PatchAlertBody } from '../models/alert.schema';

const VALID_STATUSES = new Set<string>(Object.values(AlertStatus));

export async function list(req: Request, res: Response): Promise<void> {
  // Inline validation of the single optional query param. If filtering grows
  // beyond one field, lift this into a validateQuery middleware.
  const raw = req.query.status;
  let status: AlertStatus | undefined;
  if (raw !== undefined) {
    if (typeof raw !== 'string' || !VALID_STATUSES.has(raw)) {
      throw ApiError.badRequest(
        `status must be one of ${Array.from(VALID_STATUSES).join(', ')}`,
      );
    }
    status = raw as AlertStatus;
  }

  const alerts = await alertService.list(status ? { status } : undefined);
  res.json({ alerts });
}

export async function patch(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const id = req.params.id;
  if (!id) throw ApiError.badRequest('id is required');
  const { action } = req.body as PatchAlertBody;

  const updated =
    action === 'acknowledge'
      ? await alertService.acknowledge(id, req.user.id)
      : await alertService.resolve(id, req.user.id);

  res.json({ alert: updated });
}
