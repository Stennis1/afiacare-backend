import type { Request, Response } from 'express';
import * as authService from '../services/auth.service';
import { ApiError } from '../utils/api-error';
import type { LoginBody, RegisterBody } from '../models/auth.schema';

export async function register(req: Request, res: Response): Promise<void> {
  const body = req.body as RegisterBody;
  const result = await authService.register(body);
  res.status(201).json(result);
}

export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as LoginBody;
  const result = await authService.login(body);
  res.json(result);
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) throw ApiError.unauthorized();
  const user = await authService.getCurrentUser(req.user.id);
  res.json({ user });
}
