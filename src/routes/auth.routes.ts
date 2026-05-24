import { Router } from 'express';
import * as authController from '../controllers/auth.controller';
import { validateBody } from '../middleware/validate.middleware';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../utils/async-handler';
import { loginSchema, registerSchema } from '../models/auth.schema';

export const authRouter = Router();

authRouter.post(
  '/register',
  validateBody(registerSchema),
  asyncHandler(authController.register),
);
authRouter.post(
  '/login',
  validateBody(loginSchema),
  asyncHandler(authController.login),
);
authRouter.get('/me', requireAuth, asyncHandler(authController.me));
