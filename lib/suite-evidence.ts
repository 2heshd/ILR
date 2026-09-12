import { normalizePersian } from "./persian.ts";
import type { LexicalItem, StudyState, SuiteLearningSignal } from "./types.ts";

const DAY = 86_400_000;
function recent(signal: SuiteLearningSignal, now: Date, days = 30) {
  const age = now.getTime() - Date.parse(signal.occurredAt);
  return Number.isFinite(age) && age >= 0 && age <= days * DAY;
}
function conceptValue(signal: SuiteLearningSignal) {
  return String(signal.linguisticConcept ?? "").replace(/^(root|verb|compound|syntax|morphology):/iu, "").trim();
}
function orderedRootMatch(word: string, root: string) {
  let index = 0;
  for (const letter of word) if (letter === root[index]) index += 1;
  return index === root.length;
}
function matchesWord(signal: SuiteLearningSignal, word: LexicalItem) {
  const direct = normalizePersian(signal.sourceItemId ?? "");
  if (direct && direct === word.normalizedForm) return true;
  const concept = normalizePersian(conceptValue(signal));
  const rootSignal = /^root:/iu.test(signal.linguisticConcept ?? "");
  return Boolean(concept.length >= 2 && (word.normalizedForm.includes(concept) || concept.includes(word.normalizedForm)
    || (rootSignal && orderedRootMatch(word.normalizedForm, concept))));
}

/** A support-priority signal only. It must never be used as recall or mastery credit. */
export function suiteSupportScore(state: Pick<StudyState, "suiteEvidence">, word: LexicalItem, now = new Date()) {
  return (state.suiteEvidence ?? []).filter((signal) => recent(signal, now) && matchesWord(signal, word)).reduce((score, signal) => {
    if (signal.correctness === false) return score + 2;
    if (signal.eventType === "synaptx_analysis_failure") return score + 1.5;
    if (signal.product === "synaptx") return score + 0.75;
    if (signal.eventType === "asl_word_added_to_cursos") return score + 1;
    return score + 0.25;
  }, 0);
}

export function suitePracticeFocus(state: Pick<StudyState, "suiteEvidence">, now = new Date(), limit = 3) {
  const scores = new Map<string, number>();
  for (const signal of state.suiteEvidence ?? []) {
    if (!recent(signal, now) || signal.product !== "synaptx" || !["morphology", "syntax", "verb"].includes(signal.skill ?? "")) continue;
    const value = conceptValue(signal);
    if (!value || /unclassified|sentence/iu.test(value)) continue;
    scores.set(value, (scores.get(value) ?? 0) + (signal.eventType === "synaptx_analysis_failure" ? 2 : 1));
  }
  return [...scores].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([value]) => value);
}

export function mergeSuiteEvidence(current: SuiteLearningSignal[] = [], incoming: SuiteLearningSignal[] = []) {
  const merged = new Map([...current, ...incoming].map((signal) => [signal.id, signal]));
  return [...merged.values()].sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt)).slice(0, 500);
}
