import { Role, type Patient, type User } from '@prisma/client';
import { prisma } from '../config/prisma';
import { ApiError } from '../utils/api-error';

// The DTO shape we expose to controllers. Mirrors auth.service.PublicUser
// (kept local to avoid a cross-service import for what's a one-line shape).
export interface PublicUser {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  role: Role;
  createdAt: Date;
}

export interface PatientProfile {
  id: string;
  district: string | null;
  gestationalWeeks: number | null;
  lastMenstrualPeriod: Date | null;
  dueDate: Date | null;
  parity: number | null;
  gravida: number | null;
  bloodGroup: string | null;
  updatedAt: Date;
}

export interface PatientWithUser {
  user: PublicUser;
  patient: PatientProfile | null;
}

export interface UpsertProfileInput {
  district?: string;
  gestationalWeeks?: number;
  lastMenstrualPeriod?: Date;
  dueDate?: Date;
  parity?: number;
  gravida?: number;
  bloodGroup?: string;
}

function toPublicUser(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
  };
}

function toPatientProfile(patient: Patient): PatientProfile {
  return {
    id: patient.id,
    district: patient.district,
    gestationalWeeks: patient.gestationalWeeks,
    lastMenstrualPeriod: patient.lastMenstrualPeriod,
    dueDate: patient.dueDate,
    parity: patient.parity,
    gravida: patient.gravida,
    bloodGroup: patient.bloodGroup,
    updatedAt: patient.updatedAt,
  };
}

function toPatientWithUser(user: User & { patient: Patient | null }): PatientWithUser {
  return {
    user: toPublicUser(user),
    patient: user.patient ? toPatientProfile(user.patient) : null,
  };
}

/**
 * The cross-channel bridge per §2: USSD and voice identify a caller by phone
 * number alone. If a User with this phone exists (regardless of channel of
 * origin), reuse it. Otherwise create a PATIENT user with an empty Patient
 * profile attached so risk assessments always have somewhere to land.
 */
export async function findOrCreateByPhone(phone: string): Promise<PatientWithUser> {
  const existing = await prisma.user.findUnique({
    where: { phone },
    include: { patient: true },
  });
  if (existing) return toPatientWithUser(existing);

  const created = await prisma.user.create({
    data: {
      phone,
      role: Role.PATIENT,
      patient: { create: {} },
    },
    include: { patient: true },
  });
  return toPatientWithUser(created);
}

/**
 * Self-upsert for a logged-in PATIENT. Creates the Patient row if missing
 * (e.g. a web-signup user who hasn't filled in clinical fields yet) or
 * updates the fields the caller provided.
 *
 * Only fields explicitly present in `input` are written — undefined keys
 * leave the existing value untouched. Prisma treats `undefined` as "don't
 * include this field in the SET clause," which gives us PATCH semantics
 * from a single POST endpoint.
 */
export async function upsertOwnProfile(
  userId: string,
  input: UpsertProfileInput,
): Promise<PatientProfile> {
  const patient = await prisma.patient.upsert({
    where: { userId },
    create: { userId, ...input },
    update: input,
  });
  return toPatientProfile(patient);
}

/**
 * Find-or-create empty Patient row for a given userId. Called before a
 * PATIENT's first risk check so we always have a Patient.id to attach a
 * RiskAssessment to, even if the user never filled in clinical fields.
 *
 * Unlike upsertOwnProfile this does NOT touch updatedAt when the row
 * already exists (no UPDATE in the happy path).
 */
export async function ensureProfileForUser(userId: string): Promise<PatientProfile> {
  const existing = await prisma.patient.findUnique({ where: { userId } });
  if (existing) return toPatientProfile(existing);
  const created = await prisma.patient.create({ data: { userId } });
  return toPatientProfile(created);
}

/**
 * Lookup by Patient.id (not User.id). Used by risk controller when CHW/ADMIN
 * supplies a patientId to assess on behalf of someone else.
 */
export async function getPatientById(patientId: string): Promise<PatientProfile> {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient) throw ApiError.notFound('Patient not found');
  return toPatientProfile(patient);
}

/**
 * List all PATIENT users with their profiles. Staff-only at the route layer.
 * Risk-level filtering lands in step 5 once we have RiskAssessment.
 */
export async function listPatients(): Promise<PatientWithUser[]> {
  const users = await prisma.user.findMany({
    where: { role: Role.PATIENT },
    include: { patient: true },
    orderBy: { createdAt: 'desc' },
  });
  return users.map(toPatientWithUser);
}

/**
 * Fetch one patient by their User id. Throws 404 if no such user OR if the
 * user exists but isn't a PATIENT (don't leak existence of staff accounts).
 */
export async function getPatientByUserId(targetUserId: string): Promise<PatientWithUser> {
  const user = await prisma.user.findUnique({
    where: { id: targetUserId },
    include: { patient: true },
  });
  if (!user || user.role !== Role.PATIENT) {
    throw ApiError.notFound('Patient not found');
  }
  return toPatientWithUser(user);
}
