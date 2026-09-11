import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { grammarProfileForIlr, grammarPromptForProfile } from "../lib/grammar-levels.ts";

const catalog = JSON.parse(await readFile(new URL("../data/persian-grammar-rules.json", import.meta.url), "utf8")).rules;

test("grammar profiles are cumulative and stop at the requested ILR ceiling", () => {
  const one = grammarProfileForIlr(catalog, 1);
  const two = grammarProfileForIlr(catalog, 2);
  const four = grammarProfileForIlr(catalog, 4);
  assert.ok(one.ceiling.includes("Simple past"));
  assert.ok(!one.ceiling.includes("Relative clauses"));
  assert.ok(two.ceiling.includes("Relative clauses"));
  assert.ok(!two.ceiling.includes("Complex subordination"));
  assert.ok(four.ceiling.includes("Grammar of persuasion and framing"));
  assert.ok(one.ceiling.every((rule) => two.ceiling.includes(rule)));
  assert.ok(two.ceiling.every((rule) => four.ceiling.includes(rule)));
});

test("reading and listening receive distinct invisible modality guidance", () => {
  const profile = grammarProfileForIlr(catalog, 1.5);
  const reading = grammarPromptForProfile(profile, "reading");
  const listening = grammarPromptForProfile(profile, "listening");
  assert.match(reading, /punctuation and paragraph structure/u);
  assert.match(listening, /understandable in one pass/u);
  assert.match(reading, /never mention this framework/u);
  assert.match(listening, /Do not make comprehension depend on grammar above this ceiling/u);
});
