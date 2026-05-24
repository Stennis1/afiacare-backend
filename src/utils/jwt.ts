import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';
import { ApiError } from './api-error';

export interface JwtPayload {
  sub: string;
  role: Role;
}

export function signToken(payload: JwtPayload): string {
  const opts: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  };
  return jwt.sign(payload, env.JWT_SECRET, opts);
}

export function verifyToken(token: string): JwtPayload {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    typeof (decoded as { sub?: unknown }).sub !== 'string' ||
    typeof (decoded as { role?: unknown }).role !== 'string'
  ) {
    throw ApiError.unauthorized('Invalid token payload');
  }
  const { sub, role } = decoded as { sub: string; role: Role };
  return { sub, role };
}
