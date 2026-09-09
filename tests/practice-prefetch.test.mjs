import assert from "node:assert/strict";
import test from "node:test";
import { LatestPracticePrefetch, loadPracticeWithRetries, practicePrefetchKey } from "../lib/practice-prefetch.ts";

const fingerprint = {
  kind: "reading",
  topic: "Workplace meetings",
  weekNumber: 3,
  targetIlr: 1,
  practiceMode: "controlled",
  register: "formal",
  targetWords: ["دوست"],
  wordDefinitions: [{ word: "دوست", meaning: "friend" }],
  knownWords: [],
};

test("prefetch key changes with learner-facing generation settings", () => {
  const base = practicePrefetchKey(fingerprint);
  assert.notEqual(base, practicePrefetchKey({ ...fingerprint, topic: "Health appointments" }));
  assert.notEqual(base, practicePrefetchKey({ ...fingerprint, register: "colloquial" }));
  assert.notEqual(base, practicePrefetchKey({ ...fingerprint, targetWords: ["مدرسه"] }));
});

test("a prepared exercise is consumed once", async () => {
  const cache = new LatestPracticePrefetch();
  await cache.prepare("matching", async () => ({ title: "Prepared" }));
  assert.deepEqual(cache.take("matching"), { title: "Prepared" });
  assert.equal(cache.take("matching"), null);
});

test("stale and failed preparations are never returned", async () => {
  const cache = new LatestPracticePrefetch();
  await cache.prepare("old", async () => ({ title: "Old settings" }));
  assert.equal(cache.take("new"), null);

  await cache.prepare("new", async () => { throw new Error("quality gate rejected it"); });
  assert.equal(await cache.waitAndTake("new"), null);
});

test("an older request cannot overwrite a newer preparation", async () => {
  const cache = new LatestPracticePrefetch();
  let finishOld;
  const old = new Promise((resolve) => { finishOld = resolve; });
  const oldRequest = cache.prepare("old", () => old);
  await cache.prepare("new", async () => ({ title: "New" }));
  finishOld({ title: "Old" });
  await oldRequest;
  assert.deepEqual(cache.take("new"), { title: "New" });
});

test("background preparation retries quality failures without exposing them", async () => {
  let attempts = 0;
  const value = await loadPracticeWithRetries(async () => {
    attempts++;
    if (attempts < 3) throw new Error("rejected draft");
    return { title: "Approved exercise" };
  });
  assert.equal(attempts, 3);
  assert.deepEqual(value, { title: "Approved exercise" });
});
