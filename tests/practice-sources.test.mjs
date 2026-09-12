import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { focusedSelectedPracticeWords, SELECTED_PRACTICE_LIMIT, topicPracticeWords, TOPIC_PRACTICE_LIMIT } from "../lib/practice-sources.ts";

const course = JSON.parse(await readFile(new URL("../data/course-vocabulary.json", import.meta.url), "utf8")).entries;
const news = JSON.parse(await readFile(new URL("../data/news-vocabulary.json", import.meta.url), "utf8")).entries;
const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");

test("oversized selected-word plans become a focused generation bank", () => {
  const words = Array.from({ length: 300 }, (_, index) => ({
    displayForm: `واژه ${index}`,
    definition: `word ${index}`,
    reviews: index % 4,
    correct: index % 3,
  }));
  const focused = focusedSelectedPracticeWords(words);
  assert.equal(focused.length, SELECTED_PRACTICE_LIMIT);
  assert.equal(new Set(focused.map((entry) => entry.word)).size, SELECTED_PRACTICE_LIMIT);
});

test("topic practice combines attested course and news vocabulary", () => {
  const bank = topicPracticeWords("Elections & politics", course, news);
  assert.ok(bank.length >= 20);
  assert.ok(bank.length <= TOPIC_PRACTICE_LIMIT);
  assert.ok(bank.some((entry) => course.some((word) => word.fa === entry.word)));
  assert.ok(bank.some((entry) => news.some((word) => word.displayForm === entry.word)));
  assert.equal(new Set(bank.map((entry) => entry.word.replace(/\s/gu, ""))).size, bank.length);
});

test("reading and listening expose the same two generation sources", () => {
  for (const kind of ["reading", "listening"]) {
    assert.match(page, new RegExp(`aria-label="${kind} generation source"`));
  }
  assert.match(page, /<option value="selected">Selected words<\/option>/u);
  assert.match(page, /<option value="topic">Topic bank \+ news<\/option>/u);
  assert.match(page, /focusedSelectedPracticeWords\(planned\)/u);
  assert.match(page, /topicPracticeWords\(practiceTopic\[kind\], courseCatalog, NEWS_CATALOG\)/u);
});

test("only selected-word generation uses the closed-vocabulary gate", () => {
  assert.match(route, /practiceSource === 'selected'\s*\? checkSupportingVocabulary/u);
  assert.match(route, /practiceSource === 'selected' \? unselectedContentWords/u);
  assert.match(route, /It is NOT a closed-vocabulary whitelist/u);
  assert.match(route, /selectedVocabulary\.length <= 15 \? "3-5" : selectedVocabulary\.length <= 40 \? "8-12" : "12-18"/u);
  assert.match(route, /Never append a sentence merely to mention another selected word/u);
});
