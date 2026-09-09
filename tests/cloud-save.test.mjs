import test from 'node:test';
import assert from 'node:assert/strict';
import {syncPlatformVocabulary} from '../lib/supabase.ts';

test('shared vocabulary sends one row per conflict key and caches successful uploads',async()=>{
  const batches=[];
  const client={from:()=>({upsert:async rows=>{batches.push(rows);return {error:null};}})};
  const user={id:'learner'};
  const word={sourceType:'user',normalizedForm:'کتاب',displayForm:'کتاب',definition:'book'};
  await syncPlatformVocabulary(client,user,[{...word,id:'a'},{...word,id:'b'}]);
  assert.equal(batches.length,1);
  assert.equal(batches[0].length,1);
  await syncPlatformVocabulary(client,user,[word]);
  assert.equal(batches.length,1);
});

test('failed vocabulary writes remain eligible for retry',async()=>{
  let calls=0;
  const client={from:()=>({upsert:async()=>({error:++calls===1?{code:'network'}:null})})};
  const words=[{sourceType:'user',normalizedForm:'کتاب',displayForm:'کتاب'}];
  await assert.rejects(syncPlatformVocabulary(client,{id:'learner'},words));
  await syncPlatformVocabulary(client,{id:'learner'},words);
  assert.equal(calls,2);
});
