import type { Request, Response } from 'express';
import * as notificationService from '../services/notification.service';
import type { ListNotificationsQuery } from '../models/notification.schema';

export async function list(req: Request, res: Response): Promise<void> {
  // validateQuery middleware has already parsed/coerced req.query.
  const query = req.validatedQuery as ListNotificationsQuery;
  const notifications = await notificationService.list(query);
  res.json({ notifications });
}
