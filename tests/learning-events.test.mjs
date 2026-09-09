import test from 'node:test';
import assert from 'node:assert/strict';
import {learningEventRow,makeLearningEvent} from '../lib/learning-events.ts';

test('suite events preserve attribution and remove private metadata',()=>{
  const event=makeLearningEvent({id:'00000000-0000-4000-8000-000000000001',occurredAt:'2026-09-09T12:00:00.000Z',product:'synaptx',eventType:'syntax_analysis_opened',targetLanguage:'fa',skill:'syntax',linguisticConcept:'ezafe',problemId:'00000000-0000-4000-8000-000000000002',interventionId:'00000000-0000-4000-8000-000000000003',metadata:{surface:'syntax',rawAnswer:'private',accessToken:'private',count:2}});
  assert.deepEqual(event.metadata,{surface:'syntax',count:2});
  const row=learningEventRow({id:'00000000-0000-4000-8000-000000000004'},event);
  assert.equal(row.product,'synaptx');
  assert.equal(row.event_type,'syntax_analysis_opened');
  assert.equal(row.linguistic_concept,'ezafe');
  assert.equal(row.metadata.surface,'syntax');
});

test('event names are bounded machine-readable identifiers',()=>{
  assert.throws(()=>makeLearningEvent({product:'cursos',eventType:'Reading answer',targetLanguage:'fa'}));
});

test('event normalization cannot jam the database outbox',()=>{
  const event=makeLearningEvent({id:'not-a-uuid',occurredAt:'invalid',product:'cursos',eventType:'bounded_event',targetLanguage:'fa',sessionId:'bad',problemId:'bad',relatedEventId:'bad',sourceItemId:'x'.repeat(400),interventionType:'i'.repeat(100),interventionId:'j'.repeat(300),responseMs:9_000_000,attemptNumber:20_000,supportsUsed:Array.from({length:40},(_,index)=>`support-${index}`),metadata:Object.fromEntries(Array.from({length:40},(_,index)=>[`safe_${index}`,'v'.repeat(600)]))});
  assert.match(event.id,/^[0-9a-f-]{36}$/u);
  assert.equal(event.sessionId,undefined);assert.equal(event.problemId,undefined);assert.equal(event.relatedEventId,undefined);
  assert.equal(event.sourceItemId?.length,240);assert.equal(event.interventionType?.length,80);assert.equal(event.interventionId?.length,240);
  assert.equal(event.responseMs,3_600_000);assert.equal(event.attemptNumber,10_000);assert.equal(event.supportsUsed?.length,32);
  assert.ok(JSON.stringify(event.metadata).length<=12000);
});
