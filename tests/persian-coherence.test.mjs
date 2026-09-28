import assert from "node:assert/strict";
import test from "node:test";
import { persianCoherenceIssues } from "../lib/persian-coherence.ts";

test("the generator gate rejects the incoherent routine pattern", () => {
  const passage = "من زود بیدار می‌شوم. بعد با مادربزرگ تخم‌مرغ درست می‌کنم و باهم می‌خوریم. وقتی وقت سر کار رفتن می‌رسد، مادربزرگ به من کمک می‌کند و من از خانه بیرون می‌روم.";
  const issues = persianCoherenceIssues(passage);
  assert.equal(issues.length, 4);
  assert.ok(issues.some((issue) => issue.includes("مادربزرگم")));
  assert.ok(issues.some((issue) => issue.includes("با هم")));
  assert.ok(issues.some((issue) => issue.includes("وقتِ رفتن")));
  assert.ok(issues.some((issue) => issue.includes("what the person helps")));
});

test("a coherent natural routine passes the deterministic gate", () => {
  const passage = "هر روز زود بیدار می‌شوم. بعد با مادربزرگم صبحانه می‌خورم. وقتی وقتِ رفتن به سرِ کار می‌شود، او کمک می‌کند وسایلم را آماده کنم و بعد از خانه بیرون می‌روم.";
  assert.deepEqual(persianCoherenceIssues(passage), []);
});

test("the generator gate rejects recurring military-course semantic mismatches", () => {
  assert.ok(persianCoherenceIssues("او مدارک را پر کرد و تحویل داد.").some((issue) => issue.includes("documents")));
  assert.ok(persianCoherenceIssues("او اطلاعات و مدارک خود را پر کرد.").some((issue) => issue.includes("documents")));
  assert.ok(persianCoherenceIssues("او باید مدارک را کامل پر کند.").some((issue) => issue.includes("documents")));
  assert.ok(persianCoherenceIssues("کارمند مدارک را معاینه کرد.").some((issue) => issue.includes("medically examined")));
  assert.ok(persianCoherenceIssues("او به معاینه کردن رفت.").some((issue) => issue.includes("برای معاینه")));
  assert.ok(persianCoherenceIssues("چون او ضعیف بود، برای همین معافیت نگرفت.").some((issue) => issue.includes("weakness")));
  assert.ok(persianCoherenceIssues("اگر ضعیف باشی، معافیت بهت نمی‌دن.").some((issue) => issue.includes("weakness")));
  assert.ok(persianCoherenceIssues("برگ اعزام به خدمت را اعلام کردند.").some((issue) => issue.includes("document")));
  assert.deepEqual(persianCoherenceIssues("او فرم را پر کرد، مدارک را تحویل داد و برای معاینه رفت."), []);
});
