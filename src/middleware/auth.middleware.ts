import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../utils/jwt';
import { ApiError } from '../utils/api-error';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    next(ApiError.unauthorized('Missing bearer token'));
    return;
  }
  const token = header.slice(7).trim();
  if (!token) {
    next(ApiError.unauthorized('Missing bearer token'));
    return;
  }
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    next(err);
  }
}
