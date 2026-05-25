import type { ApiLang } from './risk-strings';

// USSD screen budget per §6 is ~182 chars. All strings here are kept short
// to leave room for menu numbers and line breaks. Numbered menus stay in
// English (numerals are language-neutral) — only titles/prompts are
// translated. Recommendation strings come from risk-strings.ts (already
// localized) and are separately length-checked before send.

export interface UssdStrings {
  title_welcome: string;
  title_symptoms: string;
  title_more_symptoms: string;
  // Menu bodies are kept English for now — numeric, universal, fits the
  // char budget. When real translations land, replace these per-language.
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

// English-with-marker stubs for the three local languages. Numeric menu
// bodies stay English because numbers are universal and the char budget
// is tight. Replace each object with native-speaker text per §11.2.
function stubFor(tag: string): UssdStrings {
  const m = `[${tag}]`;
  return {
    title_welcome: `${m} ${EN.title_welcome}`,
    title_symptoms: `${m} ${EN.title_symptoms}`,
    title_more_symptoms: `${m} ${EN.title_more_symptoms}`,
    menu_symptoms_page1: EN_MENU_PAGE1,
    menu_symptoms_page2: EN_MENU_PAGE2,
    err_invalid_choice: `${m} ${EN.err_invalid_choice}`,
    err_invalid_language: `${m} ${EN.err_invalid_language}`,
    err_invalid_input: `${m} ${EN.err_invalid_input}`,
    err_internal: `${m} ${EN.err_internal}`,
    err_session: `${m} ${EN.err_session}`,
  };
}

export const ussdStrings: Record<ApiLang, UssdStrings> = {
  en: EN,
  tw: stubFor('TW'),
  dag: stubFor('DAG'),
  ee: stubFor('EE'),
};

// The first-screen language picker is intentionally rendered in English
// (numerals + native language names) because we haven't yet established
// the user's language. This is a single source of truth for that screen.
export const LANGUAGE_PICKER =
  'Welcome to AfiaCare\n1. English\n2. Twi\n3. Dagbani\n4. Ewe';
