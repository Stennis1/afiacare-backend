import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: Role;
      };
      // Populated by validateQuery middleware. Controllers cast to the
      // schema's inferred type at point of use (mirrors the req.body
      // pattern). `unknown` here forces the cast to be explicit.
      validatedQuery?: unknown;
    }
  }
}

export {};
