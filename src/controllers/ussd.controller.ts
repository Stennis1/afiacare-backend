import type { Request, Response } from 'express';
import { Channel } from '@prisma/client';
import * as patientService from '../services/patient.service';
import * as riskService from '../services/risk.service';
import * as ussdSession from '../services/ussd-session.service';
import {
  LANGUAGE_PICKER,
  ussdStrings,
  type UssdStrings,
} from '../i18n/ussd-strings';
import type { ApiLang } from '../i18n/risk-strings';
import type { SymptomInput } from '../services/risk.service';

// AT POSTs application/x-www-form-urlencoded with these four fields per §6.
interface UssdBody {
  sessionId: string;
  serviceCode: string;
  phoneNumber: string;
  text: string;
}

// Derive "symptom keys that take a boolean" from SymptomInput so the menu
// maps below stay in lockstep with the rule engine — adding a new boolean
// symptom in risk.service automatically widens this type and the compiler
// will flag any out-of-date menu mapping.
type BooleanSymptomKey = {
  [K in keyof SymptomInput]: SymptomInput[K] extends boolean | undefined ? K : never;
}[keyof SymptomInput];

// Numeric language menu mapping (matches LANGUAGE_PICKER ordering).
const LANG_BY_PRESS: Record<string, ApiLang> = {
  '1': 'en',
  '2': 'tw',
  '3': 'dag',
  '4': 'ee',
};

// Symptom menu mappings — MUST stay in sync with the menu strings rendered
// to the user (menu_symptoms_page1 / page2 in ussd-strings.ts).
const PAGE1_SYMPTOMS: Record<string, BooleanSymptomKey> = {
  '1': 'bleeding',
  '2': 'severeHeadache',
  '3': 'convulsions',
  '4': 'reducedFetalMovement',
  '5': 'feverChills',
  // '6' = "More" — not a symptom; flow falls through to page 2.
};

const PAGE2_SYMPTOMS: Record<string, BooleanSymptomKey> = {
  '1': 'highBloodPressure',
  '2': 'blurredVision',
  '3': 'swellingFaceHands',
  // '4' = "None / other" — process with no symptom flag set (expect LOW).
};

// USSD per-screen char limit. Truncate the recommendation if needed; the
// menu strings are already short enough by construction.
const USSD_CHAR_LIMIT = 175;

/**
 * USSD handler — pure translator per the architecture. Calls the same
 * services as the web controller: findOrCreateByPhone, assessAndRecord.
 * Escalation (alert + SMS) fires automatically inside assessAndRecord;
 * USSD ignores bridgeToNumbers (no live call to bridge).
 */
export async function handle(req: Request, res: Response): Promise<void> {
  // AT expects plain text. Set the content type up front so even error
  // paths return a parseable response.
  res.type('text/plain');

  try {
    const body = (req.body ?? {}) as Partial<UssdBody>;
    const { sessionId, phoneNumber, text } = body;

    if (!sessionId || !phoneNumber) {
      res.send('END Invalid request.');
      return;
    }

    const parts = text ? text.split('*') : [];

    // ----- Screen 0: nothing entered yet -> language picker -----
    if (parts.length === 0) {
      res.send(`CON ${LANGUAGE_PICKER}`);
      return;
    }

    // Validate the language press first; every downstream screen needs it.
    const langPress = parts[0];
    const lang = langPress ? LANG_BY_PRESS[langPress] : undefined;
    if (!lang) {
      // No language chosen yet — use English error message.
      res.send(`END ${ussdStrings.en.err_invalid_language}`);
      return;
    }

    // Persist for the session. The Map is overkill for a 2-step text-derived
    // flow but it's the seam we'll lean on when the flow grows (multi-symptom,
    // back-buttons, etc) — wiring it now keeps step 9 (voice) symmetrical.
    ussdSession.set(sessionId, { lang });
    const strings = ussdStrings[lang];

    // ----- Screen 1: language picked, show symptom page 1 -----
    if (parts.length === 1) {
      res.send(`CON ${strings.title_symptoms}\n${strings.menu_symptoms_page1}`);
      return;
    }

    // ----- Screen 2 input: either drill into page 2, or process a page-1 pick -----
    if (parts.length === 2) {
      const press = parts[1]!;
      if (press === '6') {
        res.send(
          `CON ${strings.title_more_symptoms}\n${strings.menu_symptoms_page2}`,
        );
        return;
      }
      const flag = PAGE1_SYMPTOMS[press];
      if (!flag) {
        res.send(`END ${strings.err_invalid_choice}`);
        return;
      }
      res.send(await processAndRespond({ flag, lang, phoneNumber, sessionId, strings }));
      return;
    }

    // ----- Screen 3 input: page-2 selection -----
    if (parts.length === 3 && parts[1] === '6') {
      const press = parts[2]!;
      if (press === '4') {
        // "None / other" — still classify (returns LOW + NO_DANGER_SIGNS).
        res.send(
          await processAndRespond({ flag: undefined, lang, phoneNumber, sessionId, strings }),
        );
        return;
      }
      const flag = PAGE2_SYMPTOMS[press];
      if (!flag) {
        res.send(`END ${strings.err_invalid_choice}`);
        return;
      }
      res.send(await processAndRespond({ flag, lang, phoneNumber, sessionId, strings }));
      return;
    }

    res.send(`END ${strings.err_invalid_input}`);
  } catch (err) {
    // CRITICAL: USSD cannot use the JSON error middleware. AT would choke
    // on a JSON body — it expects CON/END plain text. Wrap everything.
    console.error('[ussd] handler error:', err);
    res.type('text/plain').send('END Sorry, something went wrong. Please try again.');
  }
}

async function processAndRespond(args: {
  flag: BooleanSymptomKey | undefined;
  lang: ApiLang;
  phoneNumber: string;
  sessionId: string;
  strings: UssdStrings;
}): Promise<string> {
  const { patient } = await patientService.findOrCreateByPhone(args.phoneNumber);
  if (!patient) {
    // findOrCreateByPhone always creates a Patient when it creates a new
    // User, so this branch is defensive — a CHW phone reused as caller
    // would return without a patient profile.
    return `END ${args.strings.err_session}`;
  }

  const symptoms: SymptomInput = { lang: args.lang };
  if (args.flag) symptoms[args.flag] = true;

  const { result } = await riskService.assessAndRecord({
    patientId: patient.id,
    symptoms,
    channel: Channel.USSD,
  });

  ussdSession.clear(args.sessionId);
  return `END ${truncate(result.recommendation, USSD_CHAR_LIMIT)}`;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}
