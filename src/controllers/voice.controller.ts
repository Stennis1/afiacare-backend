import type { Request, Response } from 'express';
import { Channel, RiskLevel } from '@prisma/client';
import * as patientService from '../services/patient.service';
import * as riskService from '../services/risk.service';
import * as voiceSession from '../services/voice-session.service';
import {
  dial,
  getDigits,
  play,
  response,
  say,
} from '../utils/voice-xml';
import {
  voiceStrings,
  type VoicePrompt,
  type VoiceStrings,
} from '../i18n/voice-strings';
import type { ApiLang } from '../i18n/risk-strings';
import type { SymptomInput } from '../services/risk.service';

// AT Voice POSTs application/x-www-form-urlencoded with these fields per §8.5.
// We treat them all as optional and validate at the top of the handler so a
// malformed callback gets a clean XML <Say> rather than a 500.
interface VoiceBody {
  sessionId?: string;
  callerNumber?: string;
  direction?: string;
  // Spec uses `dtmf`; AT's live payload sometimes uses `dtmfDigits`. Accept
  // both — picking the first non-empty wins. Cheap insurance against an
  // intermittent docs/SDK drift.
  dtmf?: string;
  dtmfDigits?: string;
}

// Language-picker key map (matches the spoken order in voice-strings.EN).
const LANG_BY_PRESS: Record<string, ApiLang> = {
  '1': 'en',
  '2': 'tw',
  '3': 'dag',
  '4': 'ee',
};

// Derive "symptom keys that take a boolean" from SymptomInput so the menu
// stays in lockstep with the rule engine — same mapped-type filter the
// USSD controller uses. Without this filter, indexed access widens to
// boolean & number & undefined = undefined and TS rejects the assignment.
type BooleanSymptomKey = {
  [K in keyof SymptomInput]: SymptomInput[K] extends boolean | undefined ? K : never;
}[keyof SymptomInput];

// Symptom-menu key map. Deliberately a 4-option subset (not the 8-option
// USSD menu) — see §8.5: a phone caller cannot retain a long TTS list.
// Coverage is chosen to demonstrate every result-level branch:
//   1 bleeding         -> EMERGENCY  (triggers <Dial>)
//   2 severe headache  -> HIGH       (triggers <Dial>)
//   3 convulsions      -> EMERGENCY  (triggers <Dial>)
//   4 (no flag set)    -> LOW        (advice then hang up)
const SYMPTOM_BY_PRESS: Record<string, BooleanSymptomKey> = {
  '1': 'bleeding',
  '2': 'severeHeadache',
  '3': 'convulsions',
  // '4' = "any other concern" -> no flag, classifier returns LOW.
};

// Same-origin callback URL. AT will append no query string of its own;
// the next request to /voice arrives with sessionId + dtmf and we recover
// state from voice-session by sessionId.
const CALLBACK_URL = '/voice';

/**
 * Voice handler — pure translator, sibling of ussd.controller. Same
 * upstream services (`findOrCreateByPhone`, `assessAndRecord`); the only
 * voice-specific behavior is rendering AT XML and, uniquely, emitting
 * <Dial> on HIGH/EMERGENCY to bridge the live caller to a CHW phone.
 */
export async function handle(req: Request, res: Response): Promise<void> {
  // AT requires XML. Set the type up front so even the catch-all error
  // path returns parseable markup.
  res.type('application/xml');

  try {
    const body = (req.body ?? {}) as Partial<VoiceBody>;
    const sessionId = body.sessionId?.trim();
    const phoneNumber = body.callerNumber?.trim();
    const dtmf = (body.dtmf || body.dtmfDigits || '').trim();

    if (!sessionId || !phoneNumber) {
      // AT's voice gateway should never POST without these, but if it
      // does we bail with English text — no session, no language to use.
      res.send(response(say(voiceStrings.en.err_internal.text)));
      return;
    }

    const existing = voiceSession.get(sessionId);

    // ----- Step 1: no session yet -----
    if (!existing) {
      // First contact: either it's the initial dial (dtmf empty) or the
      // first dtmf is the language pick. Both land here because we don't
      // persist anything until we know the language.
      if (!dtmf) {
        // Initial ring. Prompt for language and wait for a digit.
        res.send(
          response(
            getDigits(promptXml(voiceStrings.en.language_picker, 'en'), {
              callbackUrl: CALLBACK_URL,
              numDigits: 1,
            }),
          ),
        );
        return;
      }

      const lang = LANG_BY_PRESS[dtmf];
      if (!lang) {
        // Pressed something that isn't a language key. No session to fall
        // back on, so we end the call with English error.
        res.send(response(say(voiceStrings.en.err_invalid_choice.text)));
        return;
      }

      voiceSession.set(sessionId, { lang });
      const strings = voiceStrings[lang];
      res.send(
        response(
          getDigits(promptXml(strings.symptom_menu, lang), {
            callbackUrl: CALLBACK_URL,
            numDigits: 1,
          }),
        ),
      );
      return;
    }

    // ----- Step 2: session exists -> dtmf is the symptom pick -----
    const { lang } = existing;
    const strings = voiceStrings[lang];

    // No digit pressed within timeout -> AT replays with empty dtmf. Treat
    // as an invalid choice and end the call (don't loop forever).
    if (!dtmf) {
      voiceSession.clear(sessionId);
      res.send(response(promptXml(strings.err_invalid_choice, lang)));
      return;
    }

    // '4' is the "any other concern" pseudo-option: no symptom flag, expect LOW.
    const flag = SYMPTOM_BY_PRESS[dtmf];
    if (!flag && dtmf !== '4') {
      voiceSession.clear(sessionId);
      res.send(response(promptXml(strings.err_invalid_choice, lang)));
      return;
    }

    res.send(
      await processAndRespond({
        flag,
        lang,
        phoneNumber,
        sessionId,
        strings,
      }),
    );
  } catch (err) {
    // Never let the JSON error middleware near AT's response — it expects
    // XML. Log loudly and return a graceful English <Say> + end-of-call.
    console.error('[voice] handler error:', err);
    res
      .type('application/xml')
      .send(response(say(voiceStrings.en.err_internal.text)));
  }
}

async function processAndRespond(args: {
  flag: BooleanSymptomKey | undefined;
  lang: ApiLang;
  phoneNumber: string;
  sessionId: string;
  strings: VoiceStrings;
}): Promise<string> {
  const { patient } = await patientService.findOrCreateByPhone(args.phoneNumber);
  if (!patient) {
    // Defensive: findOrCreateByPhone always creates a Patient when it
    // creates a new User, so we only land here if the caller's phone
    // belongs to an existing non-PATIENT User (CHW dialing in for tests).
    return response(promptXml(args.strings.err_internal, args.lang));
  }

  const symptoms: SymptomInput = { lang: args.lang };
  if (args.flag) symptoms[args.flag] = true;

  const { result, escalation } = await riskService.assessAndRecord({
    patientId: patient.id,
    symptoms,
    channel: Channel.VOICE,
  });

  // Always clear the session before returning — voice calls are one-shot
  // from the caller's perspective; AT may reuse the sessionId only within
  // the same call leg, which has already ended by the time we respond.
  voiceSession.clear(args.sessionId);

  switch (result.level) {
    case RiskLevel.LOW:
      // No GetDigits wrapper -> call ends after the prompt plays.
      return response(promptXml(args.strings.result_low, args.lang));

    case RiskLevel.MEDIUM:
      return response(promptXml(args.strings.result_medium, args.lang));

    case RiskLevel.HIGH:
    case RiskLevel.EMERGENCY: {
      // Voice's unique trick (§5.5): speak a reassurance line, then bridge
      // the live caller to the on-call CHW(s). escalation is guaranteed
      // non-null because risk.assessAndRecord runs it on HIGH/EMERGENCY.
      const phones = escalation?.bridgeToNumbers ?? [];
      if (phones.length === 0) {
        // Dashboard alert and SMS already fired inside escalation.handle;
        // we just can't bridge a live call. Tell the caller help is coming.
        return response(promptXml(args.strings.result_high_no_bridge, args.lang));
      }
      return response(
        promptXml(args.strings.result_high_pre_bridge, args.lang),
        dial({
          phoneNumbers: phones,
          record: true,
          maxDurationSeconds: 600,
        }),
      );
    }
  }
}

// Render a VoicePrompt as XML: <Play url=...> when we have a clip for a
// non-English language, otherwise <Say>text</Say>. Keeping this decision
// here (not at the call sites) means new languages slot in by adding a
// clipUrl in voice-strings — controller stays the same.
function promptXml(prompt: VoicePrompt, lang: ApiLang): string {
  if (lang !== 'en' && prompt.clipUrl) return play(prompt.clipUrl);
  return say(prompt.text);
}
