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

test("a foreground generation gets the same retries as background preparation", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!prepared\) prepared = await fetchBackgroundPractice\(context\)/);
  assert.doesNotMatch(source, /if \(!prepared\) prepared = await fetchPreparedPractice\(context\)/);
});

test("practice generation uses one fast draft with at most one targeted repair", async () => {
  const source = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
  assert.match(source, /AbortSignal\.timeout\(19_500\)/);
  assert.match(source, /timeout: 9_500/);
  assert.match(source, /"gpt-4\.1-mini"/);
  assert.match(source, /REPAIR THE REJECTED DRAFT BELOW/);
  assert.doesNotMatch(source, /candidatePrompts/);
  assert.doesNotMatch(source, /practice_editor_review/);
});
