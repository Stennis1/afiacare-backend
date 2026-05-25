import { Channel, Prisma, RiskLevel } from '@prisma/client';
import { prisma } from '../config/prisma';
import {
  LANG_API_TO_DB,
  renderRecommendation,
  type ApiLang,
} from '../i18n/risk-strings';
import * as escalationService from './escalation.service';
import type { EscalationOutcome } from './escalation.service';

// The shape USSD/voice/web all send in. Every field optional so a partial
// USSD payload (single keypress) and a rich web form share one input type.
export interface SymptomInput {
  bleeding?: boolean;
  severeHeadache?: boolean;
  blurredVision?: boolean;
  reducedFetalMovement?: boolean;
  highBloodPressure?: boolean;
  feverChills?: boolean;
  swellingFaceHands?: boolean;
  convulsions?: boolean;
  gestationalWeeks?: number;
  lang?: ApiLang;
}

// Mirrors §5. `reasons` are LANGUAGE-NEUTRAL keys — never translated text —
// so they're stable for analytics, dashboards, and audit.
export interface RiskResult {
  level: RiskLevel;
  reasons: string[];
  recommendation: string;
  escalate: boolean;
}

// ---------------------------------------------------------------------------
// Rule table.
//
// Each rule is an independent predicate. We collect every rule that fires,
// take the max level, dedupe reason keys, and that's the result. Adding a
// new rule is a single push to this array — no control-flow surgery.
//
// CLINICAL NOTE — needs midwife/OB review before any production use.
// Draft rationale documented inline. The risk decision is intentionally
// conservative (false positives are acceptable; false negatives are not).
// ---------------------------------------------------------------------------

interface Rule {
  match: (input: SymptomInput) => boolean;
  key: string;
  level: RiskLevel;
}

const RULES: Rule[] = [
  // EMERGENCY — get to a hospital now.
  // Convulsions in pregnancy → eclampsia. Always emergency.
  { match: (i) => !!i.convulsions, key: 'CONVULSIONS', level: RiskLevel.EMERGENCY },
  // Any reported active bleeding in pregnancy is treated as emergency.
  // Antepartum / postpartum bleeding causes are wide and time-critical.
  { match: (i) => !!i.bleeding, key: 'ACTIVE_BLEEDING', level: RiskLevel.EMERGENCY },
  // Severe pre-eclampsia pattern: headache + visual disturbance + high BP.
  {
    match: (i) => !!(i.severeHeadache && i.blurredVision && i.highBloodPressure),
    key: 'SEVERE_PREECLAMPSIA',
    level: RiskLevel.EMERGENCY,
  },

  // HIGH — see a clinician today.
  // Pre-eclampsia warning patterns (any pair, not all three).
  {
    match: (i) => !!(i.severeHeadache && i.highBloodPressure),
    key: 'PREECLAMPSIA_WARNING',
    level: RiskLevel.HIGH,
  },
  {
    match: (i) => !!(i.swellingFaceHands && i.highBloodPressure),
    key: 'PREECLAMPSIA_WARNING',
    level: RiskLevel.HIGH,
  },
  // Reduced fetal movement is a classic stillbirth warning sign in the
  // second/third trimester. We don't gate on gestationalWeeks because a
  // mother concerned enough to report it deserves triage either way.
  {
    match: (i) => !!i.reducedFetalMovement,
    key: 'REDUCED_FETAL_MOVEMENT',
    level: RiskLevel.HIGH,
  },
  // Fever + chills in pregnancy can signal sepsis / chorioamnionitis.
  { match: (i) => !!i.feverChills, key: 'FEVER_CHILLS', level: RiskLevel.HIGH },

  // MEDIUM — single symptoms in isolation. These also fire when their
  // higher-level combination fires (a headache patient with high BP gets
  // both PREECLAMPSIA_WARNING and HEADACHE), which is intentional: the
  // clinician sees every component that contributed.
  { match: (i) => !!i.severeHeadache, key: 'HEADACHE', level: RiskLevel.MEDIUM },
  { match: (i) => !!i.highBloodPressure, key: 'HIGH_BLOOD_PRESSURE', level: RiskLevel.MEDIUM },
  { match: (i) => !!i.swellingFaceHands, key: 'SWELLING', level: RiskLevel.MEDIUM },
  { match: (i) => !!i.blurredVision, key: 'BLURRED_VISION', level: RiskLevel.MEDIUM },
];

const LEVEL_ORDER: Record<RiskLevel, number> = {
  [RiskLevel.LOW]: 0,
  [RiskLevel.MEDIUM]: 1,
  [RiskLevel.HIGH]: 2,
  [RiskLevel.EMERGENCY]: 3,
};

function maxLevel(levels: RiskLevel[]): RiskLevel {
  return levels.reduce<RiskLevel>(
    (max, lvl) => (LEVEL_ORDER[lvl] > LEVEL_ORDER[max] ? lvl : max),
    RiskLevel.LOW,
  );
}

/**
 * Pure rule evaluation. No DB, no side effects. Safe to unit-test and to
 * call from any channel (web/USSD/voice) before deciding whether to persist.
 */
export function classify(input: SymptomInput): RiskResult {
  const fired = RULES.filter((r) => r.match(input));

  let level: RiskLevel;
  let reasons: string[];
  if (fired.length === 0) {
    level = RiskLevel.LOW;
    reasons = ['NO_DANGER_SIGNS'];
  } else {
    level = maxLevel(fired.map((r) => r.level));
    reasons = Array.from(new Set(fired.map((r) => r.key)));
  }

  const dbLang = LANG_API_TO_DB[input.lang ?? 'en'];
  const recommendation = renderRecommendation(level, dbLang);
  const escalate = level === RiskLevel.HIGH || level === RiskLevel.EMERGENCY;

  return { level, reasons, recommendation, escalate };
}

/**
 * Classify + persist + (if HIGH/EMERGENCY) escalate.
 *
 * Returns BOTH the rule result and the escalation outcome so channel-
 * specific controllers can use them:
 *   - web/USSD controllers ignore `escalation` (no live call to bridge)
 *   - voice.controller reads `escalation.bridgeToNumbers` to emit <Dial>
 *
 * Escalation here is a side effect, not a return-shape requirement: even
 * if the caller discards the outcome, the dashboard alert + SMS still
 * fire. This guarantees no high-risk case slips through silently.
 */
export async function assessAndRecord(args: {
  patientId: string;
  symptoms: SymptomInput;
  channel?: Channel;
}): Promise<{ result: RiskResult; escalation: EscalationOutcome | null }> {
  const result = classify(args.symptoms);
  const dbLang = LANG_API_TO_DB[args.symptoms.lang ?? 'en'];
  const channel = args.channel ?? Channel.WEB;

  const assessment = await prisma.riskAssessment.create({
    data: {
      patientId: args.patientId,
      level: result.level,
      reasons: result.reasons,
      symptomsJson: args.symptoms as unknown as Prisma.InputJsonValue,
      language: dbLang,
      recommendation: result.recommendation,
      channel,
      escalate: result.escalate,
    },
  });

  let escalation: EscalationOutcome | null = null;
  if (result.escalate) {
    escalation = await escalationService.handle({
      riskAssessmentId: assessment.id,
      patientId: args.patientId,
      level: result.level,
      channel,
    });
  }

  return { result, escalation };
}
