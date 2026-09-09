import {unselectedContentWords} from './practice-vocabulary.ts';

/** Limit additional lexical entries, while allowing their normal inflections. */
export function checkSupportingVocabulary(text: string, selected: string[], declared: unknown) {
  const issues: string[] = [];
  if (!Array.isArray(declared) || declared.some(word => typeof word !== 'string' || !word.trim() || word.length > 60 || word.trim().split(/\s+/u).length > 3 || !/[\u0600-\u06ff]/u.test(word))) {
    return {words: [] as string[], unknown: [] as string[], issues: ['List supporting vocabulary as short Persian dictionary entries.']};
  }
  const candidates = [...new Set(declared.map(word => String(word).trim()))];
  if (candidates.length > 5) issues.push('Use at most five supporting dictionary entries.');
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
  // Repair omitted labels mechanically when still within the same five-entry
  // allowance; never spend another AI round-trip just to name an observed word.
  if (unknown.length && words.length + unknown.length <= 5) {
    words.push(...unknown);
    unknown = unselectedContentWords(text, [...selected, ...words]);
  }
  if (unknown.length) issues.push(`Undeclared supporting vocabulary: ${unknown.join('، ')}`);
  return {words, unknown, issues};
}
