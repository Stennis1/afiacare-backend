import type { ApiLang } from './risk-strings';

// Voice prompt catalog per §8.5 + §11.3. The shape splits cleanly along
// AT's two action types:
//
//   - `<Say>`  — TTS, English-only in practice. We author English text here.
//   - `<Play>` — pre-recorded MP3 served from a CDN URL. We commit URL stubs
//                for tw/dag/ee so the controller is wired end-to-end; the
//                §11 follow-up is recording the clips, NOT a code change.
//
// The English entries also include placeholder Play URLs (unused by default
// because we prefer dynamic <Say> for English) — wiring them in is one
// flag flip later if we want a single voice across all languages.
//
// Why an interface (not raw strings indexed by lang): the controller never
// has to know which language is which. It asks `strings.menu_symptoms` and
// gets either a Say-friendly string or a clipUrl — a single branch in the
// controller chooses Say vs Play.

export interface VoicePrompt {
  // English text suitable for <Say>. Required even for non-English entries
  // so logs and the simulator can show what the caller is hearing.
  text: string;
  // Optional clip URL. When present AND lang !== 'en', controller emits
  // <Play url="...">. When absent, controller falls back to <Say> of `text`.
  clipUrl?: string;
}

export interface VoiceStrings {
  // Spoken at call start, before any digit has been pressed. Multilingual
  // by design — needs to invite the caller to pick a language.
  language_picker: VoicePrompt;
  // After language pick: prompt for the main symptom (single-symptom flow
  // per §8.5's "delivered as played/spoken menus + keypress input").
  symptom_menu: VoicePrompt;
  // Branching responses based on classifier output.
  result_low: VoicePrompt;
  result_medium: VoicePrompt;
  // Played BEFORE <Dial> on HIGH/EMERGENCY — never an abrupt transfer.
  result_high_pre_bridge: VoicePrompt;
  // Spoken if escalation produced an empty bridgeToNumbers list (env not
  // configured). The dashboard alert still fires; we just can't bridge.
  result_high_no_bridge: VoicePrompt;
  // Error / fallback prompts.
  err_invalid_choice: VoicePrompt;
  err_internal: VoicePrompt;
}

// CDN placeholder. Replace the host once clips are hosted; the path
// scheme is per-language/per-prompt so the swap is a one-line constant.
const CLIP_HOST = 'https://cdn.afiacare.demo/audio';
function clip(lang: ApiLang, name: string): string {
  return `${CLIP_HOST}/${lang}/${name}.mp3`;
}

const EN: VoiceStrings = {
  language_picker: {
    text: 'Welcome to AfiaCare. For English press 1. For Twi press 2. For Dagbani press 3. For Ewe press 4.',
  },
  symptom_menu: {
    text: 'Please select your main concern. Press 1 for bleeding. Press 2 for severe headache. Press 3 for convulsions. Press 4 for any other concern.',
  },
  result_low: {
    text: 'Your symptoms suggest low risk. Continue your routine antenatal care. If anything changes, please call back. Goodbye.',
  },
  result_medium: {
    text: 'Your symptoms need attention. Please visit your clinic within twenty-four hours. Goodbye.',
  },
  result_high_pre_bridge: {
    text: 'This may be serious. Please stay on the line. Connecting you to a health worker now.',
  },
  result_high_no_bridge: {
    text: 'This may be serious. A health worker has been alerted and will contact you shortly. Please proceed to the nearest hospital immediately. Goodbye.',
  },
  err_invalid_choice: {
    text: 'Sorry, that was not a valid choice. Goodbye.',
  },
  err_internal: {
    text: 'Sorry, something went wrong. Please call back. Goodbye.',
  },
};

// Stubs for non-English. Same English `text` (so logs are readable + the
// simulator shows what's playing) plus a clipUrl that the controller will
// emit as <Play>. Replace once real recordings exist.
function stubFor(lang: ApiLang): VoiceStrings {
  const withClip = (key: keyof VoiceStrings): VoicePrompt => ({
    text: EN[key].text,
    clipUrl: clip(lang, key),
  });
  return {
    language_picker: withClip('language_picker'),
    symptom_menu: withClip('symptom_menu'),
    result_low: withClip('result_low'),
    result_medium: withClip('result_medium'),
    result_high_pre_bridge: withClip('result_high_pre_bridge'),
    result_high_no_bridge: withClip('result_high_no_bridge'),
    err_invalid_choice: withClip('err_invalid_choice'),
    err_internal: withClip('err_internal'),
  };
}

export const voiceStrings: Record<ApiLang, VoiceStrings> = {
  en: EN,
  tw: stubFor('tw'),
  dag: stubFor('dag'),
  ee: stubFor('ee'),
};
