import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const course = JSON.parse(await readFile(new URL("../data/course-vocabulary.json", import.meta.url), "utf8"));
const cycle = JSON.parse(await readFile(new URL("../data/curated-cycle.json", import.meta.url), "utf8"));
const pageSource = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

const normalize = (value) => String(value)
  .normalize("NFKC")
  .replace(/[\u064b-\u065f\u0670\s‌]+/gu, "")
  .replace(/ك/gu, "ک")
  .replace(/[يى]/gu, "ی");

test("ChiMishe catalog is complete and internally consistent", () => {
  assert.equal(course.entries.length, 6060);
  assert.equal(course.meta.entries, 6060);
  assert.equal(new Set(course.entries.map((entry) => entry.id)).size, 6060);
  assert.equal(new Set(course.entries.map((entry) => entry.lesson)).size, 154);
  assert.deepEqual([...new Set(course.entries.map((entry) => entry.week))].sort((a, b) => a - b), Array.from({ length: 36 }, (_, index) => index + 1));
  assert.equal(course.entries.filter((entry) => !entry.fa.trim() || !entry.en.trim()).length, 0);

  const weekCounts = Array.from({ length: 36 }, (_, index) => course.entries.filter((entry) => entry.week === index + 1).length);
  assert.deepEqual(weekCounts, course.meta.weekCounts);
});

test("news catalog contains 100 unique usable terms", () => {
  const news = cycle.vocabulary.filter((word) => word.sourceType === "system_advanced");
  assert.equal(news.length, 100);
  assert.equal(new Set(news.map((word) => normalize(word.displayForm))).size, 100);
  assert.equal(news.filter((word) => !word.displayForm.trim() || !word.definition?.trim()).length, 0);
});

test("new learners choose vocabulary instead of receiving the pilot bank", () => {
  assert.match(pageSource, /words:\s*\[\]/u);
  assert.doesNotMatch(pageSource, /words:\s*curatedVocabulary\(\)/u);
  assert.match(pageSource, /NEWS_CATALOG/u);
  assert.match(pageSource, /Add selected/u);
});
