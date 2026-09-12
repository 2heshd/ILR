import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("topic and selected-word practice use compatible passage lengths", async () => {
  const source = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
  assert.match(source, /sentenceMin: 4, sentenceMax: 5, target: "85–100", minimum: 55/);
  assert.match(source, /sentenceMin: 3, sentenceMax: 4, target: "28–38", minimum: 24/);
  assert.match(source, /sentenceCount<passageLength\.sentenceMin/);
  assert.match(source, /wordCount<passageLength\.minimum/);
  assert.doesNotMatch(source, /around 24-36 Persian words total/);
});

test("a foreground generation gets the same retries as background preparation", async () => {
  const source = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!prepared\) prepared = await fetchBackgroundPractice\(context\)/);
  assert.doesNotMatch(source, /if \(!prepared\) prepared = await fetchPreparedPractice\(context\)/);
});

test("practice generation uses one fast model call rather than a candidate-review fan-out", async () => {
  const source = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
  assert.match(source, /AbortSignal\.timeout\(9_800\)/);
  assert.match(source, /timeout: 9_500/);
  assert.match(source, /"gpt-4\.1-mini"/);
  assert.doesNotMatch(source, /candidatePrompts/);
  assert.doesNotMatch(source, /practice_editor_review/);
});
