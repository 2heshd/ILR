import assert from "node:assert/strict";
import test from "node:test";
import { RSVP_SPEEDS, rsvpDelayMs, rsvpWordParts, rsvpWords } from "../lib/rsvp.ts";

test("RSVP splits Persian reading text without losing punctuation", () => {
  assert.deepEqual(rsvpWords("امروز  هوا خوب است."), ["امروز", "هوا", "خوب", "است."]);
});

test("RSVP gives each Persian word one stable focus character", () => {
  const parts = rsvpWordParts("کتاب‌هایم");
  assert.equal(`${parts.before}${parts.focus}${parts.after}`, "کتاب‌هایم");
  assert.match(parts.focus, /[\p{L}\p{N}]/u);
});

test("RSVP locks every focus character to the fixed stage center", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../components/RsvpReader.tsx", import.meta.url), "utf8"));
  assert.match(source, /stageBounds\.left \+ stageBounds\.width \/ 2/);
  assert.match(source, /focusBounds\.left \+ focusBounds\.width \/ 2/);
  assert.match(source, /wordElement\.style\.transform = `translateX\(\$\{offset\}px\)`/);
  assert.doesNotMatch(source, /clipPath/);
});

test("RSVP supports the intended training speeds and pauses at sentence endings", () => {
  assert.deepEqual(RSVP_SPEEDS, [250, 360, 500]);
  assert.ok(rsvpDelayMs(250, "است.") > rsvpDelayMs(250, "است"));
});

test("pattern review grades the lexical definition rather than a morphology hint", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("../app/page.tsx", import.meta.url), "utf8"));
  assert.match(source, /answerMatchesDefinition\(patternInput, current\.definition\)/);
  assert.doesNotMatch(source, /answerMatchesDefinition\(patternInput, patternHints/);
  assert.match(source, /<span className="muted">Expected<\/span><strong>\{current\.definition/);
});
