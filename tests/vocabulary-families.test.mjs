import assert from "node:assert/strict";
import test from "node:test";
import catalog from "../data/course-vocabulary.json" with { type: "json" };
import { relatedVocabulary } from "../lib/vocabulary-families.ts";

test("glossary associations connect throat to sore throat without the bullet false positive", () => {
  const family = relatedVocabulary("گَلو", "throat", catalog.entries);
  assert.ok(family.some((item) => item.word === "گلودرد" && item.meaning === "sore throat"));
  assert.equal(family.some((item) => item.word.includes("گُلوله")), false);
});
test("productive endings expose related glossary vocabulary", () => {
  const family = relatedVocabulary("دَردناک", "painful", catalog.entries);
  assert.ok(family.some((item) => item.word.replace(/[ًٌٍَُِّْٰ]/gu, "") === "درد"));
});
