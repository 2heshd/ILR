import {unselectedContentWords} from './practice-vocabulary.ts';

export const SUPPORTING_VOCABULARY_LIMIT = 8;

const COMMON_PAST_TO_INFINITIVE: Record<string,string> = {
  'آمد':'آمدن','آورد':'آوردن','برد':'بردن','بود':'بودن','خورد':'خوردن','خواست':'خواستن','خواند':'خواندن','خرید':'خریدن',
  'داشت':'داشتن','داد':'دادن','دید':'دیدن','رفت':'رفتن','رسید':'رسیدن','ساخت':'ساختن','شد':'شدن','کرد':'کردن','گرفت':'گرفتن',
  'گفت':'گفتن','نوشت':'نوشتن','شنید':'شنیدن','فروخت':'فروختن','فرستاد':'فرستادن','یافت':'یافتن','زد':'زدن','گذاشت':'گذاشتن',
};

function dictionarySupportingForm(value:string) {
  const trimmed=value.trim();
  return COMMON_PAST_TO_INFINITIVE[trimmed] ?? trimmed;
}

/** Limit additional lexical entries, while allowing their normal inflections. */
export function checkSupportingVocabulary(text: string, selected: string[], declared: unknown) {
  const issues: string[] = [];
  if (!Array.isArray(declared) || declared.some(word => typeof word !== 'string' || !word.trim() || word.length > 60 || word.trim().split(/\s+/u).length > 3 || !/[\u0600-\u06ff]/u.test(word))) {
    return {words: [] as string[], unknown: [] as string[], issues: ['List supporting vocabulary as short Persian dictionary entries.']};
  }
  const candidates = [...new Set(declared.map(word => dictionarySupportingForm(String(word))))];
  if (candidates.length > SUPPORTING_VOCABULARY_LIMIT) issues.push(`Use at most ${SUPPORTING_VOCABULARY_LIMIT} supporting dictionary entries.`);
  const words: string[] = [];
  let unknown = unselectedContentWords(text, selected);
  for (const word of candidates) {
    const remaining = unselectedContentWords(text, [...selected, ...words, word]);
    // Do not label unused entries (or alternate labels for the same form).
    if (unknown.some(form => !remaining.includes(form))) {
      words.push(word);
      unknown = remaining;
    }
  }
  // Repair omitted labels mechanically when still within the same small
  // allowance; never spend another AI round-trip just to name an observed word.
  if (unknown.length && words.length + unknown.length <= SUPPORTING_VOCABULARY_LIMIT) {
    words.push(...unknown);
    unknown = unselectedContentWords(text, [...selected, ...words]);
  }
  if (unknown.length) issues.push(`Undeclared supporting vocabulary: ${unknown.join('، ')}`);
  return {words, unknown, issues};
}
