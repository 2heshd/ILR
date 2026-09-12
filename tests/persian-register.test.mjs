import assert from "node:assert/strict";
import test from "node:test";
import { persianRegisterIssues } from "../lib/persian-coherence.ts";

test("formal passages reject conversational markers", () => {
  assert.ok(persianRegisterIssues("من یه کتاب رو خریدم.", "formal").length > 0);
  assert.deepEqual(persianRegisterIssues("من یک کتاب را خریدم.", "formal"), []);
});

test("listening passages require consistent spoken Persian", () => {
  assert.ok(persianRegisterIssues("الان توی خانه‌ام و کتاب می‌خوانم.", "colloquial").length > 0);
  assert.deepEqual(persianRegisterIssues("الان توی خونه‌ام و کتاب می‌خونم.", "colloquial"), []);
});
