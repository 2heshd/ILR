import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('Cursos records recall and per-question comprehension evidence',async()=>{
  const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.match(page,/eventType:'vocabulary_review'/u);
  assert.match(page,/eventType:'reading_answer'/u);
  assert.match(page,/eventType:'listening_answer'/u);
  assert.match(page,/eventType:'generation_quality'/u);
  assert.match(page,/generation_quality_runs/u);
  assert.match(page,/question\.type/u);
  assert.match(page,/supportsUsed:/u);
  assert.doesNotMatch(page,/metadata:\{[^}]*answers/u);
});

test('signed-out events remain in a bounded local outbox',async()=>{
  const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.match(page,/synaptx-suite-event-outbox-v1/u);
  assert.match(page,/slice\(-2000\)/u);
  assert.match(page,/flushEventOutbox\(user\)/u);
});

test('cross-product interventions remain attributable in later Cursos reviews',async()=>{
  const page=await readFile(new URL('../app/page.tsx',import.meta.url),'utf8');
  assert.match(page,/synaptx-suite-interventions-v1/u);
  assert.match(page,/cursos_intervention_received/u);
  assert.match(page,/params\.get\("intervention_id"\)/u);
  assert.match(page,/interventionType:linkedIntervention\?\.type,interventionId:linkedIntervention\?\.id/u);
});
