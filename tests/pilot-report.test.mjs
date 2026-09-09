import test from 'node:test';
import assert from 'node:assert/strict';
import {evidenceAction,pilotCsv,pilotRawCsv} from '../lib/pilot-report.ts';

test('pilot recommendations stay evidence-qualified',()=>{
 assert.match(evidenceAction({product:'synaptx',skill:'syntax',linguistic_concept:'ezafe',attempts:3,correct:1,accuracy:33,average_response_ms:9000}),/preliminary|Collect more/i);
 assert.doesNotMatch(evidenceAction({product:'cursos',skill:'listening',linguistic_concept:'detail',attempts:20,correct:8,accuracy:40,average_response_ms:9000}),/caused|proves/i);
});

test('pilot export uses participant codes and omits names, answers, and passages',()=>{
 const csv=pilotCsv('Pilot',{since:'2026-09-01',learners:[{participant_code:'P-123',attempts:2,correct:1,average_response_ms:1000,products_used:2,active_days:1}],bottlenecks:[]},[],[]);
 assert.match(csv,/P-123/);assert.doesNotMatch(csv,/display_name|answer|passage|email/i);
});

test('raw pilot export preserves attributable events without identity or private content columns',()=>{
 const csv=pilotRawCsv([{participant_code:'P-123',event_id:'event-1',occurred_at:'2026-09-01T00:00:00Z',product:'asl',event_type:'asl_novel_family_inference',target_language:'fa',skill:'vocabulary',linguistic_concept:'root:علم',intervention_type:'root_family',intervention_id:'asl-root-1',related_event_id:null,correctness:true,response_ms:1200,attempt_number:1,supports_used:[],source_kind:'family',register:null,difficulty:null,course_week:1,topic:null}]);
 assert.match(csv,/P-123/);assert.match(csv,/asl_novel_family_inference/);assert.doesNotMatch(csv,/user_id|display_name|answer|passage|email|metadata/i);
});
