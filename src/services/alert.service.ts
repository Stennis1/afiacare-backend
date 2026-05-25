import {
  AlertStatus,
  type Alert,
  type Patient,
  type RiskAssessment,
  type RiskLevel,
  type User,
} from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/api-error';

// Dashboard shape — what CHWs see in the alerts list. Includes just enough
// patient + assessment context to triage without a follow-up request.
export interface AlertView {
  id: string;
  level: RiskLevel;
  status: AlertStatus;
  patientId: string;
  riskAssessmentId: string;
  acknowledgedAt: Date | null;
  acknowledgedById: string | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  createdAt: Date;
  patient: {
    userId: string;
    fullName: string | null;
    phone: string | null;
    district: string | null;
  };
  riskAssessment: {
    level: RiskLevel;
    reasons: string[];
    recommendation: string;
    createdAt: Date;
  };
}

type AlertWithRelations = Alert & {
  patient: Patient & { user: User };
  riskAssessment: Pick<RiskAssessment, 'level' | 'reasons' | 'recommendation' | 'createdAt'>;
};

const INCLUDE = {
  patient: { include: { user: true } },
  riskAssessment: {
    select: { level: true, reasons: true, recommendation: true, createdAt: true },
  },
} as const;

function toView(a: AlertWithRelations): AlertView {
  return {
    id: a.id,
    level: a.level,
    status: a.status,
    patientId: a.patientId,
    riskAssessmentId: a.riskAssessmentId,
    acknowledgedAt: a.acknowledgedAt,
    acknowledgedById: a.acknowledgedById,
    resolvedAt: a.resolvedAt,
    resolvedById: a.resolvedById,
    createdAt: a.createdAt,
    patient: {
      userId: a.patient.userId,
      fullName: a.patient.user.fullName,
      phone: a.patient.user.phone,
      district: a.patient.district,
    },
    riskAssessment: a.riskAssessment,
  };
}

/**
 * Dashboard list. Default returns everything that still needs attention
 * (OPEN + ACKNOWLEDGED). Pass an explicit status to scope tighter.
 *
 * Ordering: EMERGENCY first (Prisma enums sort by declaration order, and
 * we declared LOW < MEDIUM < HIGH < EMERGENCY), then newest. This is what
 * the CHW wants to see at the top of the screen.
 */
export async function list(filters?: { status?: AlertStatus }): Promise<AlertView[]> {
  const where = filters?.status
    ? { status: filters.status }
    : { status: { not: AlertStatus.RESOLVED } };

  const alerts = await prisma.alert.findMany({
    where,
    include: INCLUDE,
    orderBy: [{ level: 'desc' }, { createdAt: 'desc' }],
  });
  return alerts.map(toView);
}

export async function acknowledge(alertId: string, byUserId: string): Promise<AlertView> {
  const existing = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!existing) throw ApiError.notFound('Alert not found');
  if (existing.status === AlertStatus.RESOLVED) {
    throw ApiError.conflict('Alert is already resolved');
  }

  const updated = await prisma.alert.update({
    where: { id: alertId },
    data: {
      status: AlertStatus.ACKNOWLEDGED,
      acknowledgedAt: existing.acknowledgedAt ?? new Date(),
      acknowledgedById: existing.acknowledgedById ?? byUserId,
    },
    include: INCLUDE,
  });
  return toView(updated);
}

/**
 * Resolve from any prior state. If the alert skipped ACKNOWLEDGED (e.g. the
 * CHW handled it directly and clicked "resolve"), we backfill the ack
 * timestamps with the resolver's identity so the audit trail isn't sparse.
 */
export async function resolve(alertId: string, byUserId: string): Promise<AlertView> {
  const existing = await prisma.alert.findUnique({ where: { id: alertId } });
  if (!existing) throw ApiError.notFound('Alert not found');

  const now = new Date();
  const updated = await prisma.alert.update({
    where: { id: alertId },
    data: {
      status: AlertStatus.RESOLVED,
      resolvedAt: now,
      resolvedById: byUserId,
      acknowledgedAt: existing.acknowledgedAt ?? now,
      acknowledgedById: existing.acknowledgedById ?? byUserId,
    },
    include: INCLUDE,
  });
  return toView(updated);
}
