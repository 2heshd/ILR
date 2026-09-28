import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { earlierCourseVocabulary, promptCourseSupport } from "../lib/course-prerequisites.ts";

const course = JSON.parse(await readFile(new URL("../data/course-vocabulary.json", import.meta.url), "utf8")).entries;

test("chapter practice can draw support only from earlier lesson lists", () => {
  const chapterSeven = course.filter((entry) => /^Unit 2 - Chapter 7 -/u.test(entry.lesson));
  assert.ok(chapterSeven.length > 0);
  const selectedLists = [...new Set(chapterSeven.map((entry) => entry.list))];
  const cutoff = Math.min(...selectedLists);
  const support = earlierCourseVocabulary(course, selectedLists);

  assert.ok(support.length > 0);
  assert.ok(support.every((entry) => entry.list < cutoff));
  assert.equal(support.some((entry) => entry.list >= cutoff), false);
  assert.ok(new Set(support.map((entry) => entry.lesson)).size > 1);
});

test("mixed lesson selections use the earliest target as the support boundary", () => {
  const support = earlierCourseVocabulary(course, [20, 7, 14]);
  assert.ok(support.length > 0);
  assert.ok(support.every((entry) => entry.list < 7));
});

test("a first-list lesson has no unseen supporting vocabulary", () => {
  assert.deepEqual(earlierCourseVocabulary(course, [2]), []);
  assert.deepEqual(earlierCourseVocabulary(course, []), []);
});

test("the prompt sample stays bounded while the validator can retain the full prior bank", () => {
  const support = earlierCourseVocabulary(course, [80]);
  const prompt = promptCourseSupport(support, 40);
  assert.equal(prompt.length, 40);
  assert.ok(prompt.every((entry) => support.some((candidate) => candidate.word === entry.word)));
  assert.ok(new Set(prompt.map((entry) => entry.word)).size === prompt.length);
});
