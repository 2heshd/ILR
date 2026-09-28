import type { CourseVocabularyEntry } from "./course.ts";

export type CourseSupportEntry = { word: string; meaning: string; list: number; lesson: string };

function key(value: string) {
  return value.normalize("NFKC").replace(/[\u064b-\u065f\u0670\u200c\s]/gu, "").replace(/[يى]/gu, "ی").replace(/ك/gu, "ک");
}

/**
 * Supporting vocabulary must predate every selected course target. Using the
 * earliest selected list prevents a mixed selection from leaking vocabulary
 * that is still new for one of its targets.
 */
export function earlierCourseVocabulary(entries: CourseVocabularyEntry[], targetListNumbers: number[]): CourseSupportEntry[] {
  const lists = targetListNumbers.filter((value) => Number.isInteger(value) && value > 0);
  if (!lists.length) return [];
  const cutoff = Math.min(...lists);
  const seen = new Set<string>();
  return entries
    .filter((entry) => entry.list < cutoff)
    .sort((left, right) => right.list - left.list || left.id - right.id)
    .filter((entry) => {
      const normalized = key(entry.fa);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .map((entry) => ({ word: entry.fa, meaning: entry.en, list: entry.list, lesson: entry.lesson }));
}

/** Keep the prompt compact while favoring recent review material and retaining
 * a small foundation sample from the earliest lessons. The full earlier bank
 * remains the deterministic validation boundary. */
export function promptCourseSupport(entries: CourseSupportEntry[], limit = 180) {
  if (entries.length <= limit) return entries;
  const recentCount = Math.max(1, Math.round(limit * 0.8));
  const recent = entries.slice(0, recentCount);
  const used = new Set(recent.map((entry) => key(entry.word)));
  const foundation = [...entries].reverse().filter((entry) => !used.has(key(entry.word))).slice(0, limit - recent.length);
  return [...recent, ...foundation];
}

export function vocabularyKey(value: string) {
  return key(value);
}
