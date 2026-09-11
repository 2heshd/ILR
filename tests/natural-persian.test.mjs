import assert from "node:assert/strict";
import test from "node:test";
import corpus from "../data/persian-natural-exemplars.json" with {type:"json"};
import openCorpus1 from "../data/persian-natural-corpus-1.json" with {type:"json"};
import openCorpus2 from "../data/persian-natural-corpus-2.json" with {type:"json"};
import openCorpus3 from "../data/persian-natural-corpus-3.json" with {type:"json"};
import openCorpus4 from "../data/persian-natural-corpus-4.json" with {type:"json"};
import openCorpus5 from "../data/persian-natural-corpus-5.json" with {type:"json"};
import openCorpus6 from "../data/persian-natural-corpus-6.json" with {type:"json"};
import openCorpus7 from "../data/persian-natural-corpus-7.json" with {type:"json"};
import openCorpus8 from "../data/persian-natural-corpus-8.json" with {type:"json"};
import {naturalPersianExamples,naturalPersianPrompt} from "../lib/natural-persian.ts";

const openCorpus=[openCorpus1,openCorpus2,openCorpus3,openCorpus4,openCorpus5,openCorpus6,openCorpus7,openCorpus8].flat();

test("retrieval respects register, mode, and level while returning a tiny prompt",()=>{
  const examples=naturalPersianExamples(corpus,{topic:"daily life",words:["خانه","کار"],level:1,mode:"listening",register:"colloquial"});
  assert.equal(examples.length,3);assert.ok(examples.some(text=>text.includes("خونه")));assert.ok(examples.every(text=>!text.includes("سخنگوی دولت")));
  const prompt=naturalPersianPrompt(examples);assert.match(prompt,/not facts to repeat/u);assert.ok(prompt.length<1200);
});

test("formal high-level retrieval does not leak colloquial dialogue",()=>{
  const examples=naturalPersianExamples(corpus,{topic:"government politics",words:["دولت","تصمیم"],level:3,mode:"reading",register:"formal"});
  assert.equal(examples.length,3);assert.ok(examples.some(text=>/دولت|اقدام|توافق/u.test(text)));assert.ok(examples.every(text=>!/خونه|اومد|می‌ریم/u.test(text)));
});

test("large corpus is clean, deduplicated, and available without enlarging prompts",()=>{
  assert.ok(openCorpus.length>4000);
  assert.equal(new Set(openCorpus.map(item=>item.text.replace(/[^\p{L}\p{N}]/gu,""))).size,openCorpus.length);
  assert.ok(openCorpus.every(item=>item.modes.includes("reading")&&item.modes.includes("listening")));
  const examples=naturalPersianExamples([...corpus,...openCorpus],{topic:"travel",words:["قطار","ایستگاه"],level:2,mode:"reading",register:"formal"});
  assert.equal(examples.length,3);
  assert.ok(naturalPersianPrompt(examples).length<1200);
});
