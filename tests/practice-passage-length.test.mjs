import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("generated practice passages request the longer RSVP-friendly range", async () => {
  const source = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
  assert.match(source, /four or five connected sentences containing 60-80 Persian words total, never fewer than 60 words/);
  assert.match(source, /textFa must contain four or five complete sentences and at least 60 Persian words/);
  assert.match(source, /Passage must contain 4–5 complete sentences/);
  assert.match(source, /Passage must contain at least 60 Persian words/);
  assert.doesNotMatch(source, /around 24-36 Persian words total/);
  assert.doesNotMatch(source, /45-60 Persian words/);
});

test("practice generation uses one fast model call rather than a candidate-review fan-out", async () => {
  const source = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
  assert.match(source, /AbortSignal\.timeout\(9_000\)/);
  assert.match(source, /"gpt-4\.1-mini"/);
  assert.doesNotMatch(source, /candidatePrompts/);
  assert.doesNotMatch(source, /practice_editor_review/);
});
