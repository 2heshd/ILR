import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("generated practice passages request the longer RSVP-friendly range", async () => {
  const source = await readFile(new URL("../app/api/generate/route.ts", import.meta.url), "utf8");
  assert.match(source, /four or five connected sentences, around 45-60 Persian words total/);
  assert.doesNotMatch(source, /around 24-36 Persian words total/);
});
