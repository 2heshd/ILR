import assert from "node:assert/strict";
import test from "node:test";
import corpus from "../data/persian-natural-exemplars.json" with {type:"json"};
import {naturalPersianExamples,naturalPersianPrompt} from "../lib/natural-persian.ts";

test("retrieval respects register, mode, and level while returning a tiny prompt",()=>{
  const examples=naturalPersianExamples(corpus,{topic:"daily life",words:["خانه","کار"],level:1,mode:"listening",register:"colloquial"});
  assert.equal(examples.length,3);assert.ok(examples.some(text=>text.includes("خونه")));assert.ok(examples.every(text=>!text.includes("سخنگوی دولت")));
  const prompt=naturalPersianPrompt(examples);assert.match(prompt,/not facts to repeat/u);assert.ok(prompt.length<1200);
});

test("formal high-level retrieval does not leak colloquial dialogue",()=>{
  const examples=naturalPersianExamples(corpus,{topic:"government politics",words:["دولت","تصمیم"],level:3,mode:"reading",register:"formal"});
  assert.equal(examples.length,3);assert.ok(examples.some(text=>/دولت|اقدام|توافق/u.test(text)));assert.ok(examples.every(text=>!/خونه|اومد|می‌ریم/u.test(text)));
});
