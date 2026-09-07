import test from 'node:test';
import assert from 'node:assert/strict';
import {revealPriority} from '../lib/reveal-priority.ts';
test('new and learning words precede known and automatic words',()=>{
 const values=['new','learning','known','automatic'].map(knowledgeState=>revealPriority({knowledgeState}));
 assert.ok(values.every((v,i)=>i===0||values[i-1]>v));
 assert.ok(revealPriority(undefined)>values[0]);
});
test('audio difficulty breaks ties without changing any mastery',()=>{
 const easy={knowledgeState:'learning',modalityMastery:{audio:{reviews:5,correct:5,medianResponseMs:2000}}};
 const hard={knowledgeState:'learning',modalityMastery:{audio:{reviews:5,correct:1,medianResponseMs:14000}}};
 const before=JSON.stringify(hard);assert.ok(revealPriority(hard)>revealPriority(easy));assert.equal(JSON.stringify(hard),before);
});
