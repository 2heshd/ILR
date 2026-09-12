import { getRetrievability } from "./fsrs.ts";
import type { LexicalItem, ReviewEvent, ReviewModality, StudyState } from "./types.ts";

export const DAILY_NEW_MIN = 30;
export const DAILY_NEW_DEFAULT = 35;
export const DAILY_NEW_MAX = 40;
export const RETENTION_FLOOR = 0.8;
export const RETENTION_CEILING = 0.9;

const CORE_MODALITIES: ReviewModality[] = ["visual", "audio", "cloze"];

function localDay(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function isNewCard(word: LexicalItem, mode: ReviewModality) {
  return (word.modalityCards?.[mode]?.reps ?? 0) === 0;
}

function coldReviews(reviews: ReviewEvent[], now: Date, days = 7) {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - days);
  const seen = new Set<string>();
  return reviews
    .filter((review) => Date.parse(review.reviewedAt) >= cutoff.getTime() && Date.parse(review.reviewedAt) <= now.getTime())
    .filter((review) => (review.schedulerBefore?.reps ?? 1) > 0)
    .sort((a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt))
    .filter((review) => {
      const key = `${localDay(new Date(review.reviewedAt))}:${review.lexicalItemId}:${review.modality}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function observedColdRetention(state: Pick<StudyState, "reviews">, now = new Date()) {
  const events = coldReviews(state.reviews ?? [], now);
  if (!events.length) return { retention: 0.85, samples: 0 };
  return { retention: events.filter((event) => event.correct && !event.hintUsed).length / events.length, samples: events.length };
}

function overdueReviewedCount(state: Pick<StudyState, "words">, now: Date) {
  return state.words.reduce((total, word) => total + CORE_MODALITIES.filter((mode) => {
    const card = word.modalityCards?.[mode];
    return Boolean(card && card.reps > 0 && Date.parse(card.due) <= now.getTime());
  }).length, 0);
}

export function adaptiveDailyNewLimit(state: Pick<StudyState, "words" | "reviews" | "dailyNewLimit">, now = new Date()) {
  const { retention, samples } = observedColdRetention(state, now);
  const backlog = overdueReviewedCount(state, now);
  let limit = samples < 20 ? DAILY_NEW_DEFAULT : retention >= RETENTION_CEILING ? DAILY_NEW_MAX : retention >= RETENTION_FLOOR ? DAILY_NEW_DEFAULT : DAILY_NEW_MIN;
  if (backlog > 120) limit = DAILY_NEW_MIN;
  else if (backlog > 80) limit = Math.min(limit, DAILY_NEW_DEFAULT);
  const learnerLimit = Number.isFinite(state.dailyNewLimit) ? Math.round(state.dailyNewLimit!) : DAILY_NEW_MAX;
  return Math.max(DAILY_NEW_MIN, Math.min(DAILY_NEW_MAX, learnerLimit, limit));
}

function admittedToday(state: Pick<StudyState, "reviews">, now: Date) {
  const today = localDay(now);
  return new Set((state.reviews ?? [])
    .filter((review) => localDay(new Date(review.reviewedAt)) === today && (review.schedulerBefore?.reps ?? 0) === 0)
    .map((review) => review.lexicalItemId));
}

function contextualWeakness(state: StudyState) {
  const scores = new Map<string, number>();
  const passages = new Map((state.passages ?? []).map((item) => [item.id, item]));
  const listenings = new Map((state.listeningItems ?? []).map((item) => [item.id, item]));
  for (const attempt of (state.passageAttempts ?? []).slice(-8)) {
    if (attempt.comprehensionScore >= 80) continue;
    for (const word of passages.get(attempt.passageId)?.targetWords ?? []) scores.set(word, (scores.get(word) ?? 0) + (80 - attempt.comprehensionScore) / 100);
  }
  for (const attempt of (state.listeningAttempts ?? []).slice(-8)) {
    if (attempt.comprehensionScore >= 80) continue;
    for (const word of listenings.get(attempt.listeningItemId)?.targetWords ?? []) scores.set(word, (scores.get(word) ?? 0) + (80 - attempt.comprehensionScore) / 100);
  }
  return scores;
}

function importance(word: LexicalItem) {
  const tier = { A: 3, B: 2, C: 1 }[word.tier ?? "B"];
  const source = word.sourceType === "course" || word.sourceType === "dli" ? 2 : 0;
  const suite = /cognis|synaptx/i.test(word.topic ?? "") ? 1 : 0;
  return tier + source + suite;
}

export function dailyNewWordIds(state: StudyState, candidates = state.words, now = new Date()) {
  const limit = adaptiveDailyNewLimit(state, now);
  const candidateIds = new Set(candidates.map((word) => word.id));
  const admitted = [...admittedToday(state, now)].filter((id) => candidateIds.has(id));
  const admittedSet = new Set(admitted);
  const weakness = contextualWeakness(state);
  const unseen = candidates
    .filter((word) => !admittedSet.has(word.id) && CORE_MODALITIES.every((mode) => isNewCard(word, mode)))
    .sort((a, b) => importance(b) - importance(a)
      || (weakness.get(b.normalizedForm) ?? 0) - (weakness.get(a.normalizedForm) ?? 0)
      || a.sourceWeek - b.sourceWeek
      || Date.parse(a.introducedAt) - Date.parse(b.introducedAt)
      || a.id.localeCompare(b.id));
  return [...admitted, ...unseen.slice(0, Math.max(0, limit - admitted.length)).map((word) => word.id)];
}

export function reviewPriority(word: LexicalItem, mode: ReviewModality, now = new Date()) {
  const card = word.modalityCards?.[mode];
  if (!card || card.reps === 0) return -Infinity;
  const recallRisk = 1 - getRetrievability(card, now);
  const overdueDays = Math.max(0, (now.getTime() - Date.parse(card.due)) / 86_400_000);
  return recallRisk * 100 + Math.min(30, overdueDays) + word.lapses * 2 + importance(word);
}

export function nextDayVerificationIds(state: Pick<StudyState, "reviews">, mode: ReviewModality, now = new Date()) {
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = localDay(yesterday);
  const todayKey = localDay(now);
  const firstYesterday = new Set((state.reviews ?? [])
    .filter((review) => review.modality === mode && localDay(new Date(review.reviewedAt)) === yesterdayKey && (review.schedulerBefore?.reps ?? 1) === 0)
    .map((review) => review.lexicalItemId));
  for (const review of state.reviews ?? []) {
    if (review.modality === mode && localDay(new Date(review.reviewedAt)) === todayKey) firstYesterday.delete(review.lexicalItemId);
  }
  return [...firstYesterday];
}

export function adaptiveContextWords(state: StudyState, candidates: LexicalItem[], now = new Date(), count = 20) {
  if (!candidates.length || count <= 0) return [];
  const byId = new Map(candidates.map((word) => [word.id, word]));
  const today = dailyNewWordIds(state, candidates, now).map((id) => byId.get(id)).filter((word): word is LexicalItem => Boolean(word));
  const todayIds = new Set(today.map((word) => word.id));
  const weakness = contextualWeakness(state);
  const historical = candidates.filter((word) => !todayIds.has(word.id)).sort((a, b) =>
    weakestEvidence(a) - weakestEvidence(b)
    || (weakness.get(b.normalizedForm) ?? 0) - (weakness.get(a.normalizedForm) ?? 0)
    || b.lapses - a.lapses);
  const historicalTarget = Math.min(historical.length, Math.round(count * 0.2));
  const stable = [...historical].sort((a, b) => weakestEvidence(b) - weakestEvidence(a));
  const stableTarget = Math.min(stable.length, Math.round(count * 0.1));
  const selected = [...today.slice(0, Math.max(0, count - historicalTarget - stableTarget)), ...historical.slice(0, historicalTarget)];
  const selectedIds = new Set(selected.map((word) => word.id));
  selected.push(...stable.filter((word) => !selectedIds.has(word.id)).slice(0, stableTarget));
  if (selected.length < count) {
    const used = new Set(selected.map((word) => word.id));
    selected.push(...candidates.filter((word) => !used.has(word.id)).slice(0, count - selected.length));
  }
  return selected.slice(0, count);
}

function weakestEvidence(word: LexicalItem) {
  const tested = CORE_MODALITIES.map((mode) => word.modalityMastery?.[mode]).filter((item) => item && item.reviews > 0);
  return tested.length ? Math.min(...tested.map((item) => item!.correct / item!.reviews)) : -1;
}

export function dailyAdaptivePlan(state: StudyState, now = new Date(), candidates = state.words) {
  const cold = observedColdRetention(state, now);
  const newLimit = adaptiveDailyNewLimit(state, now);
  const newWordIds = dailyNewWordIds(state, candidates, now);
  const overdue = overdueReviewedCount(state, now);
  const support = cold.samples >= 20 && cold.retention < RETENTION_FLOOR ? "intensive" : cold.retention > RETENTION_CEILING ? "light" : "standard";
  const batchSize = support === "intensive" ? 6 : support === "light" ? 8 : 7;
  return {
    targetRetention: 0.85,
    observedRetention: cold.retention,
    retentionSamples: cold.samples,
    newLimit,
    newWordIds,
    overdueReviews: overdue,
    support,
    batchSize,
    estimatedMinutes: Math.ceil((overdue * 8 + newWordIds.length * (support === "intensive" ? 55 : support === "light" ? 38 : 46)) / 60),
    contextMix: { today: 0.7, weakHistorical: 0.2, stableTransfer: 0.1 },
  } as const;
}

export function ratingFromRecall(correct: boolean, responseMs: number, priorReps: number, hintUsed = false) {
  if (!correct) return "again" as const;
  if (hintUsed || responseMs > 12_000) return "hard" as const;
  if (priorReps > 0 && responseMs <= 3_000) return "easy" as const;
  return "good" as const;
}
