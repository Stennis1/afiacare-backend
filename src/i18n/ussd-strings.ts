import type { ApiLang } from './risk-strings';

// USSD screen budget per §6 is ~182 chars. All strings here are kept short
// to leave room for menu numbers and line breaks. Menu number prefixes
// (1., 2., ...) stay numeric; the labels after them are localized per
// language. Recommendation strings come from risk-strings.ts (already
// localized) and are separately length-checked before send.

export interface UssdStrings {
  title_welcome: string;
  title_symptoms: string;
  title_more_symptoms: string;
  menu_symptoms_page1: string;
  menu_symptoms_page2: string;
  err_invalid_choice: string;
  err_invalid_language: string;
  err_invalid_input: string;
  err_internal: string;
  err_session: string;
}

const EN_MENU_PAGE1 =
  '1. Bleeding\n2. Headache\n3. Convulsions\n4. Reduced movement\n5. Fever\n6. More';
const EN_MENU_PAGE2 =
  '1. High BP\n2. Blurred vision\n3. Swelling\n4. None / other';

const TW_MENU_PAGE1 =
  '1. Mogya\n2. Tiyare\n3. Atwe\n4. Ntetee kakra\n5. Atiridii\n6. Bio';
const TW_MENU_PAGE2 =
  '1. Mogya mmoroso\n2. Ani ayɛ kusuu\n3. Nhuhuro\n4. Biara nni hɔ';

const EE_MENU_PAGE1 =
  '1. Mɔdodo\n2. Tiɖiɖi\n3. Ŋɔliɖiɖi\n4. Dɔwɔm kplɔ\n5. Kɔkɔe\n6. Eɖe';
const EE_MENU_PAGE2 =
  '1. Mɔkaka kɔkɔe\n2. Ŋkuƒoƒo gblẽ\n3. Dzidzi\n4. Naneke meli o';

const DAG_MENU_PAGE1 =
  '1. Zuli\n2. Ti ni\n3. Yoli kpehi\n4. Yoli soŋ kpema\n5. Sahi\n6. Naa';
const DAG_MENU_PAGE2 =
  '1. Zuli kɔŋ\n2. Nima nyɛɣi\n3. Kpihi\n4. Nanima maŋ';

const EN: UssdStrings = {
  title_welcome: 'Welcome to AfiaCare',
  title_symptoms: 'Select your main symptom:',
  title_more_symptoms: 'More symptoms:',
  menu_symptoms_page1: EN_MENU_PAGE1,
  menu_symptoms_page2: EN_MENU_PAGE2,
  err_invalid_choice: 'Invalid choice. Please dial again.',
  err_invalid_language: 'Invalid language. Please dial again.',
  err_invalid_input: 'Invalid input. Please dial again.',
  err_internal: 'Sorry, something went wrong. Please try again.',
  err_session: 'Sorry, we could not start your session.',
};

// Twi — demo translations. Pending native-speaker (and clinician) review
// before production per §11.2.
const TW: UssdStrings = {
  title_welcome: 'Akwaaba wo AfiaCare',
  title_symptoms: 'Paw wo yareɛ titiriw no:',
  title_more_symptoms: 'Yareɛ foforo:',
  menu_symptoms_page1: TW_MENU_PAGE1,
  menu_symptoms_page2: TW_MENU_PAGE2,
  err_invalid_choice: 'Wo paw no nyɛ nokware. Yɛsrɛ wo san frɛ bio.',
  err_invalid_language: 'Kasa a wopaw no nnyɛ nokware. Yɛsrɛ wo san frɛ bio.',
  err_invalid_input: 'Nsɛm a wode ahyɛ mu no nnyɛ nokware. Yɛsrɛ wo san frɛ bio.',
  err_internal: 'Yɛpa wo kyɛw, biribi kɔɔ mfomso. San yɛ bio.',
  err_session: 'Yɛpa wo kyɛw, yentumi anhyɛ ase wo nhyehyɛe no.',
};

// Ewe — demo translations, same review requirement as Twi.
const EE: UssdStrings = {
  title_welcome: 'Woezɔ le AfiaCare',
  title_symptoms: 'Tia nudzɔdzɔ vevitɔwò:',
  title_more_symptoms: 'Nudzɔdzɔ bubuwo:',
  menu_symptoms_page1: EE_MENU_PAGE1,
  menu_symptoms_page2: EE_MENU_PAGE2,
  err_invalid_choice: 'Tatia si nètia la mesɔ o. Taflatse gblɔ ake.',
  err_invalid_language: 'Gbegblɔ si nètia la mesɔ o. Taflatse gblɔ ake.',
  err_invalid_input: 'Nusianu si nède eme la mesɔ o. Taflatse gblɔ ake.',
  err_internal: 'Míabɔ kuku. Nya aɖe gblẽ. Taflatse te kpɔ ake.',
  err_session: 'Míabɔ kuku. Míate ŋu dze gɔme na wò dɔwɔɖi o.',
};

// Dagbani — demo translations, same review requirement as Twi/Ewe.
const DAG: UssdStrings = {
  title_welcome: 'Naa ni ti AfiaCare',
  title_symptoms: 'Pili a yoli zuɣu pam:',
  title_more_symptoms: 'Yoli bihi:',
  menu_symptoms_page1: DAG_MENU_PAGE1,
  menu_symptoms_page2: DAG_MENU_PAGE2,
  err_invalid_choice: 'A pili ka boŋ nyɛla. Gahim ka mali biɛla.',
  err_invalid_language: 'A bɔli ka boŋ nyɛla. Gahim ka mali biɛla.',
  err_invalid_input: 'A nyɛɣi ka boŋ nyɛla. Gahim ka mali biɛla.',
  err_internal: 'Pahimi. Nya ka boŋ mali. Gahim ka tehi biɛla.',
  err_session: 'Pahimi. Ti ka ŋun suhi ka pahi a tuuni o.',
};

export const ussdStrings: Record<ApiLang, UssdStrings> = {
  en: EN,
  tw: TW,
  dag: DAG,
  ee: EE,
};

// The first-screen language picker is intentionally rendered in English
// (numerals + native language names) because we haven't yet established
// the user's language. This is a single source of truth for that screen.
export const LANGUAGE_PICKER =
  'Welcome to AfiaCare\n1. English\n2. Twi\n3. Dagbani\n4. Ewe';
