import test from 'node:test';
import assert from 'node:assert/strict';
import {mean,comprehensionSummary} from '../lib/student-report.ts';
const event=(overrides={})=>({id:'sample',modality:'reading',practice_mode:'full',attempted_at:'2026-09-03T12:00:00Z',score:70,grading_mode:'ai',listens:null,transcript:null,rereads:0,duration_ms:180000,questions:[{type:'detail',score:80}],...overrides});
test('unmeasured comprehension is null, while an actual zero remains zero',()=>{
 assert.equal(mean([null,undefined,NaN]),null);assert.equal(mean([0]),0);
 const result=comprehensionSummary([],'reading');assert.equal(result.score,null);assert.ok(result.dimensions.every(d=>d.score===null&&d.count===0));
});
test('self ratings and unknown graders never inflate AI or category scores',()=>{
 const result=comprehensionSummary([event(),event({grading_mode:'self',score:100,questions:[{type:'inference',score:100}]}),event({grading_mode:'unknown',score:100})],'reading');
 assert.equal(result.score,70);assert.equal(result.selfScore,100);assert.equal(result.all.length,3);
 assert.equal(result.dimensions.find(d=>d.type==='inference').score,null);
});
test('category results are weighted by scored questions, not duplicated overall grades',()=>{
 const result=comprehensionSummary([event({score:99,questions:[{type:'detail',score:0},{type:'detail',score:100}]}),event({questions:[{type:'detail',score:20}]})],'reading');
 assert.equal(result.dimensions.find(d=>d.type==='detail').score,40);
 assert.equal(result.dimensions.find(d=>d.type==='detail').count,3);
 assert.equal(result.dimensions.find(d=>d.type==='main_idea').score,null);
});
test('listening conditions stay distinct from reading and self-rated attempts',()=>{
 const result=comprehensionSummary([event({score:100}),event({modality:'listening',listens:1,transcript:false,score:50}),event({modality:'listening',listens:2,transcript:false,score:80}),event({modality:'listening',listens:1,transcript:true,score:90}),event({modality:'listening',listens:1,transcript:false,grading_mode:'self',score:100})],'listening');
 assert.equal(result.firstListenCount,1);assert.equal(result.firstListenScore,50);assert.equal(result.assistedCount,2);assert.equal(result.assistedScore,85);assert.equal(result.self.length,1);
});
test('sentence-gist plays are not treated as full-report replays',()=>{
 const result=comprehensionSummary([event({modality:'listening',practice_mode:'gist',listens:6,transcript:false}),event({modality:'listening',practice_mode:'unknown',listens:1,transcript:false})],'listening');
 assert.equal(result.firstListenCount,0);assert.equal(result.assistedCount,0);assert.equal(result.ai.length,2);
});
