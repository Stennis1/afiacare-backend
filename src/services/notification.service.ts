import {
  NotificationChannel,
  NotificationStatus,
  Prisma,
  type Notification,
} from '@prisma/client';
import { prisma } from '../config/prisma';

export interface SendArgs {
  to: string;
  body: string;
  channel?: NotificationChannel;
  alertId?: string;
}

// Dashboard read shape. Mirrors the row 1:1 today — kept as an explicit
// interface so future schema additions (e.g. internal retry counters) don't
// silently leak into API responses.
export interface NotificationView {
  id: string;
  to: string;
  body: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  alertId: string | null;
  error: string | null;
  createdAt: Date;
  sentAt: Date | null;
}

function toView(n: Notification): NotificationView {
  return {
    id: n.id,
    to: n.to,
    body: n.body,
    channel: n.channel,
    status: n.status,
    alertId: n.alertId,
    error: n.error,
    createdAt: n.createdAt,
    sentAt: n.sentAt,
  };
}

export interface ListFilters {
  status?: NotificationStatus;
  alertId?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Recent notifications for the dashboard "what went out" panel. Filterable
 * by status (e.g. show only FAILED) and by alertId (drill-down from an
 * alert detail view). Always orders newest-first; no pagination cursor yet
 * — the dashboard reads the top N and that's enough for the demo.
 */
export async function list(filters?: ListFilters): Promise<NotificationView[]> {
  const where: Prisma.NotificationWhereInput = {};
  if (filters?.status) where.status = filters.status;
  if (filters?.alertId) where.alertId = filters.alertId;

  const take = Math.min(filters?.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

  const rows = await prisma.notification.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take,
  });
  return rows.map(toView);
}

/**
 * Phase 1 stub per §8 — logs the message and persists a Notification row
 * with status=SENT, so the dashboard "Notifications" panel has data to
 * render. Real Africa's Talking SMS swaps in behind this same signature
 * later; controllers and other services never need to change.
 *
 * Returns the persisted Notification so the caller can correlate it back
 * to an alert or audit trail.
 */
export async function send(args: SendArgs): Promise<Notification> {
  const channel = args.channel ?? NotificationChannel.SMS;
  console.log(
    `[notification][simulated ${channel}] -> ${args.to} :: ${args.body}`,
  );
  return prisma.notification.create({
    data: {
      to: args.to,
      body: args.body,
      channel,
      status: NotificationStatus.SENT,
      sentAt: new Date(),
      alertId: args.alertId,
    },
  });
}
