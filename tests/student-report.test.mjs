import test from 'node:test';
import assert from 'node:assert/strict';
import {accuracy,evidenceAdvice,skillTrend} from '../lib/student-report.ts';
test('student summaries distinguish missing, limited, and measured evidence',()=>{
 const skill={modality:'audio',attempts:0,correct:0,early_attempts:0,recent_attempts:0,early_correct:0,recent_correct:0};
 assert.equal(accuracy(0,0),null);assert.match(evidenceAdvice(skill),/Not practiced/);
 assert.match(evidenceAdvice({...skill,attempts:2,correct:2}),/Limited evidence/);
 assert.equal(skillTrend({...skill,early_attempts:4,recent_attempts:20}),null);
 assert.equal(skillTrend({...skill,early_attempts:10,early_correct:5,recent_attempts:10,recent_correct:8}),30);
 assert.match(evidenceAdvice({...skill,attempts:20,correct:10}),/another skill does not replace/);
});
