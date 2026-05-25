import { Language, RiskLevel } from '@prisma/client';

// API exposes lowercase language codes per §5 ('en' | 'tw' | 'dag' | 'ee').
// Postgres enum is uppercase by convention. This map is the seam.
export type ApiLang = 'en' | 'tw' | 'dag' | 'ee';

export const LANG_API_TO_DB: Record<ApiLang, Language> = {
  en: Language.EN,
  tw: Language.TW,
  dag: Language.DAG,
  ee: Language.EE,
};

export const LANG_DB_TO_API: Record<Language, ApiLang> = {
  [Language.EN]: 'en',
  [Language.TW]: 'tw',
  [Language.DAG]: 'dag',
  [Language.EE]: 'ee',
};

// ---------------------------------------------------------------------------
// Recommendation templates, keyed by language then risk level.
//
// English is authoritative. The other three languages are CURRENTLY STUBS:
// they prepend a clear marker and reuse the English text so the demo returns
// something legible. Per §11.2, native-speaker review is required before any
// production use — a mistranslated danger-sign instruction is a real-world
// harm, not a cosmetic bug. Replace each stub object with reviewed text.
// ---------------------------------------------------------------------------

const EN_TEMPLATES: Record<RiskLevel, string> = {
  EMERGENCY:
    'This may be a life-threatening emergency. Please go to a hospital immediately. A health worker has been alerted.',
  HIGH:
    'You have warning signs that need urgent attention. Please visit a clinic today. A health worker has been alerted.',
  MEDIUM:
    'You have symptoms that should be checked by a health worker soon. Please visit a clinic within the next day.',
  LOW:
    'No urgent danger signs were reported. Continue your regular antenatal visits and call back if anything changes.',
};

function stubFor(langTag: string): Record<RiskLevel, string> {
  const marker = `[${langTag} — needs native-speaker translation]`;
  return {
    EMERGENCY: `${marker} ${EN_TEMPLATES.EMERGENCY}`,
    HIGH: `${marker} ${EN_TEMPLATES.HIGH}`,
    MEDIUM: `${marker} ${EN_TEMPLATES.MEDIUM}`,
    LOW: `${marker} ${EN_TEMPLATES.LOW}`,
  };
}

const TEMPLATES: Record<Language, Record<RiskLevel, string>> = {
  [Language.EN]: EN_TEMPLATES,
  [Language.TW]: stubFor('TW'),
  [Language.DAG]: stubFor('DAG'),
  [Language.EE]: stubFor('EE'),
};

export function renderRecommendation(level: RiskLevel, lang: Language): string {
  return TEMPLATES[lang][level];
}
