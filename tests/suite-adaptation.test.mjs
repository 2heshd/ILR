import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createSerializedCard } from "../lib/fsrs.ts";
import { dailyNewWordIds } from "../lib/daily-adaptive.ts";
import { mergeSuiteEvidence, suitePracticeFocus, suiteSupportScore } from "../lib/suite-evidence.ts";

const now = new Date("2026-09-11T12:00:00-07:00");
const word = (id, form) => ({ id, displayForm: form, normalizedForm: form, definition: id, sourceType: "course", sourceWeek: 1, tier: "B", knowledgeState: "new", introducedAt: now.toISOString(), reviews: 0, correct: 0, lapses: 0, dueAt: now.toISOString(), modalityCards: { visual: createSerializedCard(now), audio: createSerializedCard(now), cloze: createSerializedCard(now) } });
const state = (words, suiteEvidence = []) => ({ words, suiteEvidence, reviews: [], dailyNewLimit: 40, weekNumber: 1, currentIlr: 1, skillLevels: { reading: 1, listening: 1, speaking: 1 }, course: { catalogId: "x", sourceFile: "x", importedWeeks: [] }, anki: { endpoint: "", deckName: "" }, passages: [], passageAttempts: [], listeningItems: [], listeningAttempts: [], speakingPrompts: [], speakingAttempts: [] });

test("Cognis root difficulty prioritizes related words without granting mastery", () => {
  const words = Array.from({ length: 40 }, (_, index) => word(String(index), index === 39 ? "مکتوب" : `واژه${index}`));
  const signal = { id: "cognis-1", occurredAt: now.toISOString(), product: "asl", eventType: "asl_novel_family_inference", skill: "vocabulary", linguisticConcept: "root:کتب", correctness: false };
  const current = state(words, [signal]);
  assert(suiteSupportScore(current, words[39], now) > 0);
  assert.equal(words[39].reviews, 0);
  assert(dailyNewWordIds(current, words, now).includes("39"));
});

test("Synaptx concepts become bounded practice focuses without importing learner text", () => {
  const signals = [
    { id: "s1", occurredAt: now.toISOString(), product: "synaptx", eventType: "synaptx_syntax_analysis", skill: "syntax", linguisticConcept: "syntax:ezafe" },
    { id: "s2", occurredAt: now.toISOString(), product: "synaptx", eventType: "synaptx_morphology_analysis", skill: "morphology", linguisticConcept: "root:رفت" },
    { id: "s3", occurredAt: now.toISOString(), product: "synaptx", eventType: "synaptx_syntax_analysis", skill: "syntax", linguisticConcept: "syntax:ezafe" },
  ];
  assert.deepEqual(suitePracticeFocus({ suiteEvidence: signals }, now), ["ezafe", "رفت"]);
  assert.equal(JSON.stringify(signals).includes("sentenceText"), false);
});

test("suite evidence deduplicates and remains bounded", () => {
  const many = Array.from({ length: 520 }, (_, index) => ({ id: String(index), occurredAt: new Date(now.getTime() - index).toISOString(), product: "synaptx", eventType: "synaptx_morphology_analysis" }));
  const merged = mergeSuiteEvidence([many[0]], many);
  assert.equal(merged.length, 500);
  assert.equal(new Set(merged.map((item) => item.id)).size, 500);
});

test("Cursos fetches only privacy-safe suite event fields and sends focus labels to generation", async () => {
  const supabase = await readFile(new URL("../lib/supabase.ts", import.meta.url), "utf8");
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const route = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
  assert.match(supabase, /select\("id,occurred_at,product,event_type,skill,linguistic_concept,source_item_id,correctness,response_ms"\)/u);
  assert.doesNotMatch(supabase, /select\([^\n]*(raw|answer|passage|transcript|query)/iu);
  assert.match(page, /practiceFocus = suitePracticeFocus/u);
  assert.match(route, /privacy-safe labels, not learner text/u);
});
