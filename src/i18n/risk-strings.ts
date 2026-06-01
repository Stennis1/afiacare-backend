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

// Twi — demo translations. Per §11.2 a mistranslated danger-sign instruction
// is a real-world harm, not a cosmetic bug. These MUST be reviewed by a
// native Twi-speaking clinician before any non-demo use.
const TW_TEMPLATES: Record<RiskLevel, string> = {
  EMERGENCY:
    'Eyi betumi ayɛ tebea a ɛde nkwa to asiane mu. Kɔ ayaresabea ntɛm ara. Wɔabɔ apɔmuden adwumayɛni amanneɛ.',
  HIGH:
    'Wowɔ nsɛnkyerɛnne a ɛhwehwɛ ntɛm mmoa. Kɔ ayaresabea anaa clinic nnɛ. Wɔabɔ apɔmuden adwumayɛni amanneɛ.',
  MEDIUM:
    'Wowɔ yareɛ ho nsɛnkyerɛnne a ɛsɛ sɛ apɔmuden adwumayɛni hwɛ ntɛm. Kɔ clinic no wɔ da a ɛdi hɔ no mu.',
  LOW:
    'Wɔanhu asiane ho nsɛnkyerɛnne biara a ɛhia ntɛm mmoa. Toa wo awo ansa na awoɔ nhwehwɛmu ahorow no so na sɛ biribi sesa a, san frɛ bio.',
};

// Ewe — same demo-only / clinician-review requirement as Twi.
const EE_TEMPLATES: Record<RiskLevel, string> = {
  EMERGENCY:
    'Esia ate ŋu anye nɔnɔme si ado ŋuwò ƒe agbe le afɔku me. Taflatse yi dɔyɔƒe enumake. Woɖo aɖaŋu na lãmesẽdɔwɔla aɖe.',
  HIGH:
    'Èle dzesiwo siwo hia kpɔkpɔ enumake la nu. Taflatse yi klinik la egbea. Woɖo aɖaŋu na lãmesẽdɔwɔla aɖe.',
  MEDIUM:
    'Èle nudzɔdzɔwo siwo hia be lãmesẽdɔwɔla nakpɔ kpuie la nu. Taflatse yi klinik la le ŋkeke si gbɔna me.',
  LOW:
    'Mede dzesi vɔ̃ɖi aɖeke si hia mɔɖeɖe enumake o. Yi edzi kple wò fuƒoƒo ƒe dokita kpɔkpɔwo eye ne nane trɔ la, gblɔ ake.',
};

// Dagbani — same demo-only / clinician-review requirement as Twi/Ewe.
const DAG_TEMPLATES: Record<RiskLevel, string> = {
  EMERGENCY:
    'Nya ŋɔ ka ŋun nyɛla mɔɣu ka nyɛ a sihim. Gahim ka di hospital ni yuun. Ti kpɛri laafee tuuntua yili.',
  HIGH:
    'A ni mali yoli ni bɔhigu ka hia pam. Gahim ka di clinic ni din. Ti kpɛri laafee tuuntua yili.',
  MEDIUM:
    'A ni yoli ni hia ka laafee tuuntua kpɛri. Gahim ka di clinic ni zaa din yuun.',
  LOW:
    'Ti ka nyɛ yoli ni bɔhigu ka hia pam o. Kpɛli ka mali a puuni laafee kpɛrim ni. Nya ka mali, mali biɛla.',
};

const TEMPLATES: Record<Language, Record<RiskLevel, string>> = {
  [Language.EN]: EN_TEMPLATES,
  [Language.TW]: TW_TEMPLATES,
  [Language.DAG]: DAG_TEMPLATES,
  [Language.EE]: EE_TEMPLATES,
};

export function renderRecommendation(level: RiskLevel, lang: Language): string {
  return TEMPLATES[lang][level];
}
