import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("topic and selected-word practice use adaptive passage lengths", async () => {
  const source = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
  assert.match(source, /sentenceMin: 4, sentenceMax: 8, target: "110–135", minimum: 60/);
  assert.match(source, /selectedCount <= 15.*sentenceMin: 3, sentenceMax: 5, target: "36–50", minimum: 30, supportingMaximum: 30/);
  assert.match(source, /selectedCount <= 40.*sentenceMin: 4, sentenceMax: 6, target: "55–75", minimum: 44, supportingMaximum: 40/);
  assert.match(source, /sentenceMin: 4, sentenceMax: 7, target: "90–110", minimum: 65, supportingMaximum: 55/);
  assert.match(source, /sentenceCount<passageLength\.sentenceMin/);
  assert.match(source, /wordCount<passageLength\.minimum/);
  assert.doesNotMatch(source, /around 24-36 Persian words total/);
});

test("foreground generation is single-attempt while background preparation may retry", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!prepared\) prepared = await fetchPreparedPractice\(context\)/);
  assert.match(source, /loadPracticeWithRetries\(\(\) => fetchPreparedPractice\(context, request\)\)/);
  assert.match(source, /AbortSignal\.timeout\(10_000\)/);
});

test("practice generation permits at most one bounded rewrite inside ten seconds", async () => {
  const source = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
  assert.match(source, /AbortSignal\.timeout\(9_000\)/);
  assert.match(source, /timeout: 8_200/);
  assert.match(source, /"gpt-4\.1"/);
  assert.match(source, /isPractice \? 1800 : 2200/);
  assert.match(source, /ONE BOUNDED REWRITE/);
  assert.match(source, /performance\.now\(\) - requestStarted < 4_500/);
  assert.doesNotMatch(source, /REPAIR THE REJECTED DRAFT/);
  assert.doesNotMatch(source, /repairAttempt/);
  assert.doesNotMatch(source, /for \(let repair/);
  assert.match(source, /normalizeColloquialFunctionWords/);
  assert.match(source, /replace\(\/می‌\?کند\/gu, "می‌کنه"\)/);
  assert.match(source, /replace\(\/می‌\?شوند\/gu, "می‌شن"\)/);
  assert.match(source, /persianCoherenceIssues/);
  assert.match(source, /persianRegisterIssues/);
  assert.doesNotMatch(source, /candidatePrompts/);
  assert.doesNotMatch(source, /practice_editor_review/);
});
