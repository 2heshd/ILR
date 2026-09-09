import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceAction,pilotCsv} from '../lib/pilot-report.ts';

test('pilot recommendations stay evidence-qualified',()=>{
 assert.match(evidenceAction({product:'synaptx',skill:'syntax',linguistic_concept:'ezafe',attempts:3,correct:1,accuracy:33,average_response_ms:9000}),/preliminary|Collect more/i);
 assert.doesNotMatch(evidenceAction({product:'cursos',skill:'listening',linguistic_concept:'detail',attempts:20,correct:8,accuracy:40,average_response_ms:9000}),/caused|proves/i);
});

test('pilot export uses participant codes and omits names, answers, and passages',()=>{
 const csv=pilotCsv('Pilot',{since:'2026-09-01',learners:[{participant_code:'P-123',attempts:2,correct:1,average_response_ms:1000,products_used:2,active_days:1}],bottlenecks:[]},[],[]);
 assert.match(csv,/P-123/);assert.doesNotMatch(csv,/display_name|answer|passage|email/i);
});
