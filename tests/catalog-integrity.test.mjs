import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectContextWords } from "../lib/adaptive.ts";
import { unselectedContentWords } from "../lib/practice-vocabulary.ts";
import { dedupeLexicalWords, removeDeletedSharedWord } from "../lib/word-merge.js";

const course = JSON.parse(await readFile(new URL("../data/course-vocabulary.json", import.meta.url), "utf8"));
const cycle = JSON.parse(await readFile(new URL("../data/curated-cycle.json", import.meta.url), "utf8"));
const newsCatalog = JSON.parse(await readFile(new URL("../data/news-vocabulary.json", import.meta.url), "utf8"));
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

test("news catalog contains 2,000 unique sourced usable terms", () => {
  const news = newsCatalog.entries;
  assert.equal(news.length, 2000);
  assert.equal(newsCatalog.meta.entries, 2000);
  assert.equal(newsCatalog.meta.frequencySampleEntries, 100);
  assert.equal(newsCatalog.meta.newspaperBookEntries, 654);
  assert.equal(newsCatalog.meta.advancedCourseEntries, 1246);
  assert.equal(new Set(news.map((word) => normalize(word.displayForm))).size, 2000);
  assert.equal(news.filter((word) => !word.displayForm.trim() || !word.definition?.trim()).length, 0);
  assert.equal(news.filter((word) => !["frequency_sample", "newspaper_book", "advanced_course"].includes(word.provenance)).length, 0);
});

test("new learners choose vocabulary instead of receiving the pilot bank", () => {
  assert.match(pageSource, /words:\s*\[\]/u);
  assert.doesNotMatch(pageSource, /words:\s*curatedVocabulary\(\)/u);
  assert.match(pageSource, /NEWS_CATALOG/u);
  assert.match(pageSource, /Add selected/u);
  assert.doesNotMatch(pageSource, /Course words ·/u);
  assert.match(pageSource, /span-12 news-catalog/u);
  assert.match(pageSource, /Selected · uncheck to remove/u);
  assert.match(pageSource, /removeWord\(word\.normalizedForm\)/u);
});

test("reading and listening generation are constrained to learner-selected vocabulary", async () => {
  const route = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
  assert.match(route, /Learner-selected vocabulary bank/u);
  assert.match(route, /use ONLY vocabulary selected in the learner bank/u);
  assert.match(route, /newWordsIntroduced must be \[\]/u);
  assert.match(route, /treat bank entries as dictionary forms/u);
  assert.match(route, /never use an infinitive ending in کردن, شدن, دادن, گرفتن, داشتن, or بودن as a finite sentence predicate/u);
  assert.match(route, /selected-only vocabulary must never produce broken Persian/u);
  assert.match(route, /never omit the copula from a nominal sentence/u);
  assert.match(route, /check semantic roles and Persian collocations/u);
  assert.match(route, /selectedVocabulary\.length < 8/u);
  assert.match(route, /never force awkward repetition/u);
  assert.match(route, /prefer a shorter, clear, idiomatic passage/u);
  assert.match(route, /name: "persian_practice_item"/u);
  assert.match(route, /newWordsIntroduced: \{ type: "array", maxItems: 0/u);
  assert.match(route, /reasoning: \{ effort: isPractice \? "low" : "none" \}/u);
  assert.match(route, /REPAIR THE PREVIOUS DRAFT/u);
  assert.match(route, /status: 422/u);
  assert.match(route, /suggestedWords: violations\.slice\(0, 8\)/u);
  assert.match(pageSource, /if \(!state\.words\.length\)/u);
  assert.match(pageSource, /selectedContextKeys/u);
});

test("closed-vocabulary validation accepts inflections and rejects unselected content", () => {
  const selected = ["دولت", "گزارش", "اعلام کردن", "اقتصاد", "کشور", "کاهش"];
  assert.deepEqual(unselectedContentWords("دولت گزارش را اعلام کرد و اقتصاد کشور کاهش یافت. این گزارش مهم است.", [...selected, "یافتن", "مهم"]), []);
  assert.deepEqual(unselectedContentWords("دولت‌ها گزارش را اعلام کردند.", selected), []);
  assert.deepEqual(unselectedContentWords("اقتصاد کشور کاهش داشت.", selected), ["داشت"]);
  assert.deepEqual(unselectedContentWords("گزارش افزایش را نشان داد.", [...selected, "افزایش", "نشان دادن"]), []);
  assert.deepEqual(unselectedContentWords("شرکت تولید را افزایش داد.", [...selected, "شرکت", "تولید", "افزایش", "نشان دادن"]), ["افزایش دادن"]);
});

test("shared vocabulary merges by normalized Persian form without losing review references", () => {
  const result = dedupeLexicalWords([
    { id: "cloud", displayForm: "تعليم", normalizedForm: "تعليم", definition: "education", reviews: 4, correct: 3, lapses: 1 },
    { id: "asl", displayForm: "تعلیم", normalizedForm: "تعلیم", romanization: "taʿlīm", topic: "Asl derivation", reviews: 0, correct: 0, lapses: 0 },
  ]);

  assert.equal(result.words.length, 1);
  assert.equal(result.words[0].id, "cloud");
  assert.equal(result.words[0].normalizedForm, "تعلیم");
  assert.equal(result.words[0].definition, "education");
  assert.equal(result.words[0].romanization, "taʿlīm");
  assert.equal(result.words[0].reviews, 4);
  assert.equal(result.aliases.get("asl"), "cloud");

  const compound = dedupeLexicalWords([
    { id: "saved", displayForm: "استخراج کردن", normalizedForm: "استخراجکردن" },
    { id: "repeat", displayForm: "استخراج کردن", normalizedForm: "استخراج کردن", definition: "to extract" },
  ]);
  assert.equal(compound.words.length, 1);
  assert.equal(compound.words[0].definition, "to extract");
});

test("a shared-bank deletion removes only the matching personal word", () => {
  const words = [
    { id: "personal", displayForm: "تعلیم", normalizedForm: "تعلیم", sourceType: "user" },
    { id: "course-copy", displayForm: "تعليم", normalizedForm: "تعليم", sourceType: "course" },
    { id: "other", displayForm: "تدریس", normalizedForm: "تدریس", sourceType: "user" },
  ];

  const result = removeDeletedSharedWord(words, { normalized_form: "تَعْلِيم" });

  assert.deepEqual(result.map((word) => word.id), ["course-copy", "other"]);
});

test("a newly added Asl word enters the context pool used by readings and listenings", () => {
  const olderWords = Array.from({ length: 100 }, (_, index) => ({
    id: `older-${index}`,
    displayForm: `واژه${index}`,
    sourceWeek: 1,
    knowledgeState: "known",
    reviews: 4,
    correct: 4,
  }));
  const aslWord = {
    id: "asl-current",
    displayForm: "استخراج کردن",
    sourceWeek: 12,
    knowledgeState: "learning",
    reviews: 0,
    correct: 0,
  };

  const selected = selectContextWords({ words: [...olderWords, aslWord], weekNumber: 12 }, 80);

  assert.equal(selected.length, 80);
  assert.ok(selected.includes("استخراج کردن"));
});

test("personal vocabulary carries its saved meaning and pronunciation into Synaptx", () => {
  assert.match(pageSource, /function morphologyUrl\(word: string, definition\?: string, romanization\?: string\)/u);
  assert.match(pageSource, /params\.set\("definition", definition\.trim\(\)\)/u);
  assert.match(pageSource, /params\.set\("romanization", romanization\.trim\(\)\)/u);
  assert.match(pageSource, /morphologyUrl\(word\.displayForm, word\.definition, word\.romanization\)/u);
  assert.match(pageSource, /courseWordKey\(word\.displayForm\) === incomingKey/u);
});
