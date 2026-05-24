import { Role, type User } from '@prisma/client';
import { prisma } from '../config/prisma';
import { hashPassword, verifyPassword } from '../utils/password';
import { signToken } from '../utils/jwt';
import { ApiError } from '../utils/api-error';

export interface PublicUser {
  id: string;
  email: string | null;
  fullName: string | null;
  phone: string | null;
  role: Role;
  createdAt: Date;
}

function toPublic(user: User): PublicUser {
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
  };
}

export interface RegisterInput {
  email: string;
  password: string;
  fullName: string;
  phone?: string;
}

export async function register(
  input: RegisterInput,
): Promise<{ user: PublicUser; token: string }> {
  const emailTaken = await prisma.user.findUnique({ where: { email: input.email } });
  if (emailTaken) throw ApiError.conflict('Email already in use');

  if (input.phone) {
    const phoneTaken = await prisma.user.findUnique({ where: { phone: input.phone } });
    if (phoneTaken) throw ApiError.conflict('Phone already in use');
  }

  const passwordHash = await hashPassword(input.password);

  // Public signup is ALWAYS a patient. CHW/DHO/ADMIN are seeded or invited (§2).
  const user = await prisma.user.create({
    data: {
      email: input.email,
      passwordHash,
      fullName: input.fullName,
      phone: input.phone,
      role: Role.PATIENT,
    },
  });

  const token = signToken({ sub: user.id, role: user.role });
  return { user: toPublic(user), token };
}

export interface LoginInput {
  email: string;
  password: string;
}

export async function login(
  input: LoginInput,
): Promise<{ user: PublicUser; token: string }> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.passwordHash) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw ApiError.unauthorized('Invalid email or password');

  const token = signToken({ sub: user.id, role: user.role });
  return { user: toPublic(user), token };
}

export async function getCurrentUser(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.unauthorized('User no longer exists');
  return toPublic(user);
}
