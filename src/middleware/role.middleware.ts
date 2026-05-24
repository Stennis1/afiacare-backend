import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Role } from '@prisma/client';
import { ApiError } from '../utils/api-error';

export function requireRole(...allowed: Role[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }
    if (!allowed.includes(req.user.role)) {
      next(ApiError.forbidden(`Requires role: ${allowed.join(' or ')}`));
      return;
    }
    next();
  };
}
