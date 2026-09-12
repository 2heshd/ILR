import {unselectedContentWords} from './practice-vocabulary.ts';

// Selected-word passages still need ordinary glue vocabulary to remain
// idiomatic. Twenty stays bounded, while avoiding rejection when a coherent
// passage needs a small number of inflected everyday terms around specialist
// learner-selected nouns.
export const SUPPORTING_VOCABULARY_LIMIT = 20;

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
export function checkSupportingVocabulary(text: string, selected: string[], declared: unknown, limit = SUPPORTING_VOCABULARY_LIMIT) {
  const issues: string[] = [];
  if (!Array.isArray(declared)) {
    return {words: [] as string[], unknown: [] as string[], issues: ['List supporting vocabulary as short Persian dictionary entries.']};
  }
  // Treat this model-produced list as an untrusted hint. Invalid or unused labels
  // are discarded; the passage itself is still checked token by token below and
  // cannot become visible unless every extra item fits the bounded allowance.
  const validLabels=declared.filter((word):word is string=>typeof word==='string'&&Boolean(word.trim())&&word.length<=60&&word.trim().split(/\s+/u).length<=3&&/[\u0600-\u06ff]/u.test(word));
  if(validLabels.length!==declared.length&&!text.trim())issues.push('List supporting vocabulary as short Persian dictionary entries.');
  const candidates = [...new Set(validLabels.map(dictionarySupportingForm))];
  if (candidates.length > limit) issues.push(`Use at most ${limit} supporting dictionary entries.`);
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
  if (unknown.length && words.length + unknown.length <= limit) {
    words.push(...unknown);
    unknown = unselectedContentWords(text, [...selected, ...words]);
  }
  if (unknown.length) issues.push(`Undeclared supporting vocabulary: ${unknown.join('، ')}`);
  return {words, unknown, issues};
}
