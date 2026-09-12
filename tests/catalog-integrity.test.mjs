import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectContextWords } from "../lib/adaptive.ts";
import { courseSectionLabel } from "../lib/course.ts";
import { unselectedContentWords } from "../lib/practice-vocabulary.ts";
import { dedupeLexicalWords, removeDeletedSharedWord } from "../lib/word-merge.js";
import { compactStudyState, readStudyState, writeStudyState } from "../lib/storage.ts";
import { NEWS_TOPICS, newsTopicFor } from "../lib/news-topics.ts";

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

test("ChiMishe vocabulary can be selected in complete chapters and modules", () => {
  const sections = new Map();
  for (const entry of course.entries) {
    const section = courseSectionLabel(entry.lesson);
    sections.set(section, (sections.get(section) ?? 0) + 1);
  }
  assert.equal(sections.size, 52);
  assert.equal([...sections.values()].reduce((total, count) => total + count, 0), 6060);
  assert.equal(courseSectionLabel("Unit 3 - Chapter 9 - Lesson 2"), "Unit 3 · Chapter 9");
  assert.equal(courseSectionLabel("Semester 3 - Module 7 - Lesson 4"), "Semester 3 · Module 7");
  assert.equal(courseSectionLabel("Introductory Unit - Lesson 8"), "Introductory Unit");
  assert.match(pageSource, /Choose whole chapters or modules/u);
  assert.match(pageSource, /addSelectedCourseSections/u);
  assert.match(pageSource, /selectedCourseSectionEntryCount/u);
});

test("large chapter selections use compact, recoverable browser storage", () => {
  const card = { due: "2026-09-03T00:00:00.000Z", stability: 0, difficulty: 0, elapsedDays: 0, scheduledDays: 0, reps: 0, lapses: 0, learningSteps: 0, state: 0 };
  const state = {
    words: [{ id: "course-1", displayForm: "تعلیم", normalizedForm: "تعلیم", definition: "education", sourceType: "course", sourceWeek: 1, introducedAt: card.due, reviews: 0, correct: 0, lapses: 0, dueAt: card.due, fsrsCard: card, modalityCards: { visual: card, audio: card, cloze: card } }],
    passages: [{ id: "cycle-reading" }], listeningItems: [{ id: "cycle-listening" }], speakingPrompts: [{ id: "cycle-speaking" }],
  };
  const compact = compactStudyState(state);
  assert.equal(compact.words[0].modalityCards, undefined);
  assert.equal(compact.words[0].fsrsCard, undefined);
  assert.deepEqual(compact.passages, []);

  const saved = new Map();
  const storage = { getItem: (key) => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value), removeItem: (key) => saved.delete(key) };
  assert.equal(writeStudyState(storage, "state", state), true);
  assert.equal(readStudyState(storage, "state", []).state.words[0].displayForm, "تعلیم");
  saved.set("state", "{broken");
  assert.deepEqual(readStudyState(storage, "state", []), { state: null, recovered: true });
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

test("course and news catalogs use explicit bulk add and remove selection", () => {
  assert.match(pageSource, /Deselect all/u);
  assert.match(pageSource, /Remove selected/u);
  assert.match(pageSource, /In your bank/u);
  assert.doesNotMatch(pageSource, /Selected · uncheck to remove/u);
});

test("new learners choose vocabulary instead of receiving the pilot bank", () => {
  assert.match(pageSource, /words:\s*\[\]/u);
  assert.doesNotMatch(pageSource, /words:\s*curatedVocabulary\(\)/u);
  assert.match(pageSource, /NEWS_CATALOG/u);
  assert.match(pageSource, /Add to \{planLabels\[planMode\]\}/u);
  assert.doesNotMatch(pageSource, /Course words ·/u);
  assert.match(pageSource, /span-12 news-catalog/u);
  assert.match(pageSource, /Choose a unit, chapter, or lesson/u);
  assert.match(pageSource, /Optional vocabulary for building current-events reading and listening/u);
  assert.doesNotMatch(pageSource, /Selected · uncheck to remove/u);
});

test("the local workflow gives learners one ordered starting point", () => {
  assert.match(pageSource, /Today&apos;s path/u);
  assert.match(pageSource, /Choose words[\s\S]*Text recall[\s\S]*Audio recall[\s\S]*Patterns[\s\S]*Reading[\s\S]*Listening[\s\S]*Speaking/u);
  assert.match(pageSource, /<span className="path-step">6<\/span>Speaking/u);
  assert.match(pageSource, /const \[tab, setTab\] = useState<Tab>\("home"\)/u);
});

test("news vocabulary is grouped into learner-facing topics", () => {
  assert.equal(NEWS_TOPICS[0], "All topics");
  assert.equal(newsCatalog.entries.filter((word) => !newsTopicFor(word)).length, 0);
  assert.ok(new Set(newsCatalog.entries.map(newsTopicFor)).size >= 6);
  assert.match(pageSource, /newsTopicFor\(word\)/u);
});

test("reading and listening generation are constrained to learner-selected vocabulary", async () => {
  const route = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
  assert.match(route, /AT MOST FIVE additional supporting/u);
  assert.match(route, /data.newWordsIntroduced=supporting.words/u);
  assert.match(route, /rejectionIssues=\[\.\.\.supporting.issues,\.\.\.practiceAnswerIssues\(data.questions\),\.\.\.persianCoherenceIssues\(data.textFa\),\.\.\.persianRegisterIssues/u);
  assert.doesNotMatch(route, /data\s*=\s*verdict.exercise/u);
  assert.match(route, /if\(rejectionIssues.length\)/u);
  assert.doesNotMatch(route, /naturalnessScore/u);
  assert.doesNotMatch(route, /candidatePrompts/u);
  assert.match(route, /newWordsIntroduced: \{ type: "array", maxItems: 5/u);
  assert.match(route, /No inference question is required/u);
  assert.doesNotMatch(route, /one main idea, two detail, one inference/u);
  assert.match(route, /SILENT NATIVE EDIT/u);
  assert.match(route, /status: 422/u);
  assert.match(route, /suggestedWords: violations\.slice\(0, 8\)/u);
  assert.match(pageSource, /if \(!currentState\.words\.length\)/u);
  assert.match(pageSource, /selectedContextKeys/u);
  assert.match(pageSource, /practicePrefetchRef\.current\[kind\]/u);
  assert.match(pageSource, /activatePreparedPractice\(kind, prepared\)/u);
  assert.match(pageSource, /fetchBackgroundPractice\(context\)/u);
});

test("closed-vocabulary validation accepts inflections and rejects unselected content", () => {
  const selected = ["دولت", "گزارش", "اعلام کردن", "اقتصاد", "کشور", "کاهش"];
  assert.deepEqual(unselectedContentWords("دولت گزارش را اعلام کرد و اقتصاد کشور کاهش یافت. این گزارش مهم است.", [...selected, "یافتن", "مهم"]), []);
  assert.deepEqual(unselectedContentWords("دولت‌ها گزارش را اعلام کردند.", selected), []);
  assert.deepEqual(unselectedContentWords("اقتصاد کشور کاهش داشت.", selected), ["داشت"]);
  assert.deepEqual(unselectedContentWords("گزارش افزایش را نشان داد.", [...selected, "افزایش", "نشان دادن"]), []);
  assert.deepEqual(unselectedContentWords("شرکت تولید را افزایش داد.", [...selected, "شرکت", "تولید", "افزایش", "نشان دادن"]), ["داد"]);
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
