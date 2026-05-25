import { Channel, NotificationChannel, type RiskLevel } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import * as notificationService from './notification.service';

// Mirrors §5.5. The voice controller reads bridgeToNumbers and emits <Dial>;
// web/USSD ignore it (no live call to bridge). Same outcome shape regardless
// of which channel triggered it.
export interface EscalationOutcome {
  raisedAlertId: string;
  smsQueued: boolean;
  bridgeToNumbers: string[];
}

export interface HandleArgs {
  riskAssessmentId: string;
  patientId: string;
  level: RiskLevel;
  channel: Channel;
}

/**
 * The escalation policy lives here, not in any controller (§5.5). Today the
 * policy is: every HIGH/EMERGENCY case raises ONE dashboard alert AND queues
 * an SMS to every phone in env.ESCALATION_CHW_PHONES. Tomorrow, when we add
 * district routing or on-call shifts, only this function changes.
 */
export async function handle(args: HandleArgs): Promise<EscalationOutcome> {
  // 1. Raise the dashboard alert. Always — this is the durable record of the
  //    case regardless of whether any SMS lands.
  const alert = await prisma.alert.create({
    data: {
      patientId: args.patientId,
      riskAssessmentId: args.riskAssessmentId,
      level: args.level,
    },
  });

  // 2. Build SMS body with enough context that a CHW glancing at their phone
  //    knows who to call back. Fetch patient identity for that context.
  const patient = await prisma.patient.findUnique({
    where: { id: args.patientId },
    include: { user: true },
  });
  const patientLabel = patient?.user.fullName ?? '(unnamed)';
  const patientPhone = patient?.user.phone ?? 'unknown';
  const body =
    `[AfiaCare] ${args.level} case via ${args.channel} from ` +
    `${patientLabel} (${patientPhone}). Alert ${alert.id.slice(0, 8)}. ` +
    `Open the dashboard to triage.`;

  // 3. Fan out the SMS. Stub for now (logged + Notification row). Same
  //    interface when AT-SMS is wired up — escalation doesn't care.
  const phones = env.ESCALATION_CHW_PHONES;
  for (const phone of phones) {
    await notificationService.send({
      to: phone,
      body,
      channel: NotificationChannel.SMS,
      alertId: alert.id,
    });
  }

  return {
    raisedAlertId: alert.id,
    smsQueued: phones.length > 0,
    bridgeToNumbers: phones,
  };
}
