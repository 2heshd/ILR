import test from 'node:test';
import assert from 'node:assert/strict';
import {independentSchedules} from '../lib/independent-schedules.ts';
import {createSerializedCard,reviewFsrs} from '../lib/fsrs.ts';
import {dueWords,plannedWords} from '../lib/study-plans.ts';
import {compactStudyState} from '../lib/storage.ts';
import {patternHints} from '../lib/persian-patterns.ts';
const now=new Date('2026-09-03T12:00:00');
const card=createSerializedCard(now);
const word={id:'one',displayForm:'آموزش',introducedAt:now.toISOString(),reviews:0,sourceType:'course',modalityCards:{visual:card,audio:card,cloze:card}};
test('migration rebuilds only channels with actual review evidence',()=>{
  const shared=reviewFsrs(card,'easy',now).after;
  const result=independentSchedules({...word,modalityCards:{visual:shared,audio:shared,cloze:shared}},[{lexicalItemId:'one',modality:'visual',rating:'easy',reviewedAt:now.toISOString()}]);
  assert.equal(result.visual.reps,1);assert.equal(result.audio.reps,0);assert.equal(result.cloze.reps,0);
});
test('a correct text answer does not hide audio or pattern reviews',()=>{
  const text=reviewFsrs(card,'good',now).after;
  const state={words:[{...word,modalityCards:{visual:text,audio:card,cloze:card}}],reviews:[{lexicalItemId:'one',modality:'visual',correct:true,reviewedAt:now.toISOString(),schedulerBefore:card}]};
  assert.equal(dueWords(state,'visual',now).length,0);
  assert.equal(dueWords(state,'audio',now).length,1);
  assert.equal(dueWords(state,'cloze',now).length,1);
  assert.equal(dueWords(state,'visual',new Date(text.due)).length,1,'learning steps return when due');
});
test('new-word limit never caps already learned due reviews',()=>{
  const words=Array.from({length:110},(_,i)=>({...word,id:String(i),modalityCards:{visual:{...card,reps:i<60?3:0}}}));
  assert.equal(dueWords({words,reviews:[],dailyNewLimit:40},'visual',now).length,100);
});
test('day/week plans are independent, expire, and cannot resurrect deleted words',()=>{
  const state={words:[word],studyPlans:{reading:{enabled:true,wordIds:['one','deleted'],period:'day',startsOn:'2026-09-03'}}};
  assert.equal(plannedWords(state,'reading',now).length,1);
  assert.equal(plannedWords(state,'listening',now).length,0);
  assert.equal(plannedWords(state,'reading',new Date('2026-09-04T12:00:00')).length,0);
});
test('saving preserves reviewed channel schedules and generated exercises',()=>{
  const reviewed={...word,reviews:1};
  const state={words:[reviewed],passages:[{id:'user-reading'}],listeningItems:[{id:'user-audio'}],speakingPrompts:[]};
  const saved=compactStudyState(state);
  assert.deepEqual(saved.words[0].modalityCards,reviewed.modalityCards);
  assert.equal(saved.passages[0].id,'user-reading');assert.equal(saved.listeningItems[0].id,'user-audio');
});
test('hints explain attested examples without treating every final shin as a suffix',()=>{
  assert.equal(patternHints('آموزش')[0].form,'ـش');assert.equal(patternHints('آتش').length,0);
  assert.equal(patternHints('فرودگاه')[0].form,'ـگاه');
});
