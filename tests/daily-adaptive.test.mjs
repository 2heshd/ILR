import assert from "node:assert/strict";
import test from "node:test";
import { createSerializedCard } from "../lib/fsrs.ts";
import { adaptiveContextWords, adaptiveDailyNewLimit, dailyAdaptivePlan, dailyNewWordIds, nextDayVerificationIds, observedColdRetention, ratingFromRecall } from "../lib/daily-adaptive.ts";
import { dueWords } from "../lib/study-plans.ts";

const now = new Date("2026-09-11T12:00:00-07:00");
const newCard = createSerializedCard(now);
const word = (id, reps = 0, due = now) => ({
  id, displayForm: `واژه${id}`, normalizedForm: `واژه${id}`, definition: `word ${id}`,
  sourceType: "course", sourceWeek: 1, tier: "B", knowledgeState: "new",
  introducedAt: now.toISOString(), reviews: reps, correct: 0, lapses: 0, dueAt: due.toISOString(),
  modalityCards: { visual: { ...newCard, reps, due: due.toISOString() }, audio: { ...newCard }, cloze: { ...newCard } },
});
const state = (words, reviews = []) => ({
  words, reviews, dailyNewLimit: 40, weekNumber: 1, currentIlr: 1,
  skillLevels: { reading: 1, listening: 1, speaking: 1 }, course: { catalogId: "x", sourceFile: "x", importedWeeks: [] }, anki: { endpoint: "", deckName: "" },
  passages: [], passageAttempts: [], listeningItems: [], listeningAttempts: [], speakingPrompts: [], speakingAttempts: [],
});
const history = (correct, count = 20) => Array.from({ length: count }, (_, index) => ({
  id: `r-${index}`, lexicalItemId: `seen-${index}`, modality: "visual", correct,
  hintUsed: false, responseMs: 4000, rating: correct ? "good" : "again",
  reviewedAt: new Date(now.getTime() - 86_400_000 - index * 1000).toISOString(),
}));

test("daily intake adapts only within the DLI 30–40 word band", () => {
  const words = Array.from({ length: 100 }, (_, index) => word(String(index)));
  assert.equal(adaptiveDailyNewLimit(state(words), now), 35);
  assert.equal(adaptiveDailyNewLimit(state(words, history(true)), now), 40);
  assert.equal(adaptiveDailyNewLimit(state(words, history(false)), now), 30);
});

test("the daily cohort is stable after some new words have been studied", () => {
  const words = Array.from({ length: 80 }, (_, index) => word(String(index)));
  const first = dailyNewWordIds(state(words), words, now);
  assert.equal(first.length, 35);
  const studied = first.slice(0, 10).map((id, index) => ({
    id: `today-${index}`, lexicalItemId: id, modality: "visual", correct: true, responseMs: 3000, rating: "good",
    reviewedAt: now.toISOString(), schedulerBefore: { ...newCard, reps: 0 },
  }));
  const next = dailyNewWordIds(state(words, studied), words, now);
  assert.equal(next.length, 35);
  assert.deepEqual(next.slice(0, 10), first.slice(0, 10));
});

test("every overdue review is retained before the admitted new cohort", () => {
  const overdue = new Date(now.getTime() - 3 * 86_400_000);
  const words = [...Array.from({ length: 70 }, (_, index) => word(`old-${index}`, 3, overdue)), ...Array.from({ length: 80 }, (_, index) => word(`new-${index}`))];
  const queue = dueWords(state(words), "visual", now);
  assert.equal(queue.filter((item) => item.id.startsWith("old-")).length, 70);
  assert.equal(queue.filter((item) => item.id.startsWith("new-")).length, 35);
  assert(queue.slice(0, 70).every((item) => item.id.startsWith("old-")));
});

test("audio and patterns activate after text instead of tripling first exposure", () => {
  const fresh = word("fresh");
  assert.equal(dueWords(state([fresh]), "visual", now).length, 1);
  assert.equal(dueWords(state([fresh]), "audio", now).length, 0);
  assert.equal(dueWords(state([fresh]), "cloze", now).length, 0);
  fresh.modalityCards.visual = { ...fresh.modalityCards.visual, reps: 1, due: new Date(now.getTime() + 86_400_000).toISOString() };
  assert.equal(dueWords(state([fresh]), "audio", now).length, 1);
  assert.equal(dueWords(state([fresh]), "cloze", now).length, 1);
});

test("same-session repeats cannot inflate cold retention", () => {
  const reviews = [
    { ...history(false, 1)[0], lexicalItemId: "one" },
    { ...history(true, 1)[0], id: "retry", lexicalItemId: "one", reviewedAt: new Date(now.getTime() - 86_399_000).toISOString() },
  ];
  assert.deepEqual(observedColdRetention({ reviews }, now), { retention: 0, samples: 1 });
});

test("first exposures are excluded from cold retention and verified next day", () => {
  const yesterday = new Date(now.getTime() - 86_400_000);
  const first = { id: "first", lexicalItemId: "one", modality: "visual", correct: true, hintUsed: false, responseMs: 2000, rating: "good", reviewedAt: yesterday.toISOString(), schedulerBefore: { ...newCard, reps: 0 } };
  assert.deepEqual(observedColdRetention({ reviews: [first] }, now), { retention: 0.85, samples: 0 });
  assert.deepEqual(nextDayVerificationIds({ reviews: [first] }, "visual", now), ["one"]);
  const verified = { ...first, id: "verified", reviewedAt: now.toISOString(), schedulerBefore: { ...newCard, reps: 1 } };
  assert.deepEqual(nextDayVerificationIds({ reviews: [first, verified] }, "visual", now), []);
});

test("unfinished modalities remain active after a cohort day ends", () => {
  const yesterday = new Date(now.getTime() - 86_400_000);
  const started = word("started");
  started.modalityCards.visual = { ...started.modalityCards.visual, reps: 1, due: new Date(now.getTime() + 5 * 86_400_000).toISOString() };
  const queue = dueWords(state([started]), "audio", now);
  assert.equal(queue[0]?.id, "started");
  void yesterday;
});

test("reading and listening context favors today's cohort plus weak and stable words", () => {
  const words = Array.from({ length: 60 }, (_, index) => {
    const item = word(String(index));
    if (index >= 35) {
      item.modalityMastery = { visual: { reviews: 5, correct: index < 50 ? 1 : 5 } };
      item.modalityCards = Object.fromEntries(Object.entries(item.modalityCards).map(([mode, card]) => [mode, { ...card, reps: 5, due: new Date(now.getTime() + 86_400_000).toISOString() }]));
    }
    return item;
  });
  const context = adaptiveContextWords(state(words), words, now, 20);
  assert.equal(context.length, 20);
  assert(context.some((item) => Number(item.id) >= 35 && Number(item.id) < 50));
  assert(context.some((item) => Number(item.id) >= 50));
});

test("recall ratings use correctness, hints, latency, and prior evidence", () => {
  assert.equal(ratingFromRecall(false, 1000, 8), "again");
  assert.equal(ratingFromRecall(true, 13000, 8), "hard");
  assert.equal(ratingFromRecall(true, 1000, 0), "good");
  assert.equal(ratingFromRecall(true, 1000, 1), "easy");
  assert.equal(ratingFromRecall(true, 1000, 8, true), "hard");
});

test("daily plan exposes retention target, workload, and multimodal context mix", () => {
  const plan = dailyAdaptivePlan(state(Array.from({ length: 60 }, (_, index) => word(String(index)))), now);
  assert.equal(plan.targetRetention, 0.85);
  assert.equal(plan.newWordIds.length, 35);
  assert.deepEqual(plan.contextMix, { today: 0.7, weakHistorical: 0.2, stableTransfer: 0.1 });
  assert(plan.estimatedMinutes > 0);
});

test("daily plan counts new words only from the learner's active deck", () => {
  const words = Array.from({ length: 60 }, (_, index) => word(String(index)));
  const candidates = words.slice(0, 12);
  const plan = dailyAdaptivePlan(state(words), now, candidates);
  assert.equal(plan.newLimit, 35);
  assert.equal(plan.newWordIds.length, 12);
  assert(plan.newWordIds.every((id) => candidates.some((item) => item.id === id)));
});

test("a newly selected 30–40 word DLI lesson is admitted intact", () => {
  const lesson = Array.from({ length: 38 }, (_, index) => word(String(index)));
  const current = state(lesson);
  const plan = dailyAdaptivePlan(current, now, lesson);
  assert.equal(plan.newLimit, 38);
  assert.equal(plan.newWordIds.length, 38);

  const firstExposures = plan.newWordIds.slice(0, 10).map((id, index) => ({
    id: `first-${index}`, lexicalItemId: id, modality: "visual", correct: index % 2 === 0,
    hintUsed: false, responseMs: 5000, rating: index % 2 === 0 ? "good" : "again",
    reviewedAt: now.toISOString(), schedulerBefore: { ...newCard, reps: 0 },
  }));
  const afterStart = dailyAdaptivePlan(state(lesson, firstExposures), now, lesson);
  assert.equal(afterStart.newLimit, 38);
  assert.equal(afterStart.newWordIds.length, 38);
  assert.deepEqual(observedColdRetention({ reviews: firstExposures }, now), { retention: 0.85, samples: 0 });
});
