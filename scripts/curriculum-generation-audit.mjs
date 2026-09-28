import { readFile, writeFile } from "node:fs/promises";
import { earlierCourseVocabulary, vocabularyKey } from "../lib/course-prerequisites.ts";
import { practiceAnswerIssues } from "../lib/practice-answers.ts";
import { persianCoherenceIssues, persianRegisterIssues } from "../lib/persian-coherence.ts";

const base = (process.argv[2] || "http://localhost:3004").replace(/\/$/u, "");
const repetitions = Math.max(1, Math.min(3, Number(process.argv[3] || 2)));
const course = JSON.parse(await readFile(new URL("../data/course-vocabulary.json", import.meta.url), "utf8")).entries;
const chapter = course.filter((entry) => /^Unit 2 - Chapter 7 -/u.test(entry.lesson));
const target = chapter.slice(0, 24);
const targetWords = target.map((entry) => entry.fa);
const targetCourseListNumbers = [...new Set(target.map((entry) => entry.list))];
const allowedSupport = new Set(earlierCourseVocabulary(course, targetCourseListNumbers).map((entry) => vocabularyKey(entry.word)));

async function generate(kind, register, repetition) {
  const started = performance.now();
  const response = await fetch(`${base}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind,
      register,
      repetition,
      targetIlr: 2,
      practiceSource: "selected",
      topic: "Selected vocabulary",
      targetWords,
      targetCourseListNumbers,
      wordDefinitions: target.map((entry) => ({ word: entry.fa, meaning: entry.en })),
      knownWords: [],
      previousTitles: [],
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const data = await response.json().catch(() => ({ error: "Non-JSON response" }));
  const checks = [];
  if (!response.ok) checks.push(`HTTP ${response.status}: ${data.error || "generation failed"}`);
  else {
    checks.push(...persianCoherenceIssues(data.textFa), ...persianRegisterIssues(data.textFa, register), ...practiceAnswerIssues(data.questions));
    const outOfSequence = (data.newWordsIntroduced ?? []).filter((word) => !allowedSupport.has(vocabularyKey(String(word))));
    if (outOfSequence.length) checks.push(`Out-of-sequence support: ${outOfSequence.join("، ")}`);
    if (!Array.isArray(data.knownWordsUsed) || data.knownWordsUsed.length < 3) checks.push("Fewer than three target words used");
  }
  return { kind, register, repetition, status: response.status, seconds: Number(((performance.now() - started) / 1000).toFixed(2)), checks, data };
}

const cases = [];
for (let repetition = 1; repetition <= repetitions; repetition += 1) {
  for (const kind of ["reading", "listening"]) for (const register of ["formal", "colloquial"]) cases.push([kind, register, repetition]);
}
const results = [];
for (let offset = 0; offset < cases.length; offset += 2) {
  results.push(...await Promise.all(cases.slice(offset, offset + 2).map(([kind, register, repetition]) => generate(kind, register, repetition))));
}
const summary = { total: results.length, passed: results.filter((result) => !result.checks.length).length, failed: results.filter((result) => result.checks.length).length };
await writeFile("/tmp/cursos-curriculum-generation-audit.json", JSON.stringify({ summary, results }, null, 2));
console.log(JSON.stringify({ summary, results: results.map(({ kind, register, repetition, status, seconds, checks }) => ({ kind, register, repetition, status, seconds, checks })) }, null, 2));
process.exitCode = summary.failed ? 1 : 0;
