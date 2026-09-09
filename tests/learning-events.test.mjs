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
