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
