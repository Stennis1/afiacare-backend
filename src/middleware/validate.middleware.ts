import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodSchema } from 'zod';

export function validateBody<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.body = result.data;
    next();
  };
}

/**
 * Validate req.query against a zod schema. Parsed/coerced data is attached
 * to req.validatedQuery — controllers cast it to the inferred schema type
 * (mirrors the req.body pattern). We use a side slot instead of mutating
 * req.query because Express 5 made req.query read-only; this stays
 * forward-compatible.
 */
export function validateQuery<T>(schema: ZodSchema<T>): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(result.error);
      return;
    }
    req.validatedQuery = result.data;
    next();
  };
}
