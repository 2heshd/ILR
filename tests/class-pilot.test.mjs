import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeClassCode,validClassCode,classInviteLink,inviteCodeFromHash} from '../lib/class-invites.ts';
import {csvCell,classroomCsv} from '../lib/classroom-export.ts';
import {compactStudyState} from '../lib/storage.ts';
test('invite links normalize codes and keep them out of the query string',()=>{
 const code='abcdef123456abcdef123456';
 assert.equal(normalizeClassCode(' ABCDEF 123456ABCDEF123456 '),code);
 assert.equal(validClassCode('bad<script>'),false);
 const link=new URL(classInviteLink('https://getcursos.vercel.app',code));
 assert.equal(link.search,'');assert.equal(inviteCodeFromHash(link.hash),code);assert.equal(inviteCodeFromHash('#join=javascript:bad'),'');
});
test('weekly export guards spreadsheet formulas and leaves private comprehension blank',()=>{
 assert.equal(csvCell('=1+1'),'"\'=1+1"');assert.equal(csvCell('a"b'),'"a""b"');assert.equal(csvCell(null),'""');
 const csv=classroomCsv('Pilot',[{user_id:'fixture',display_name:'=BAD()',reviews:12,text_retention:0,audio_retention:null,pattern_retention:80,comprehension_shared:false,daily:[{day:'2026-09-03'}],comprehension:[{modality:'reading',grading_mode:'ai',score:99,questions:[]}]}]);
 assert.match(csv,/reading_ai_attempts/);assert.match(csv,/'=BAD/);assert.ok(!csv.includes('"99"'));assert.match(csv,/"0"/);
});
test('compaction retains ten weeks of review and comprehension history and question maps',()=>{
 const attempts=Array.from({length:70},(_,i)=>({id:'attempt-'+i,passageId:'cycle-fixture',attemptedAt:new Date(Date.UTC(2026,0,i+1)).toISOString(),readingMode:'inference'}));
 const state={words:[],reviews:Array.from({length:3500},(_,i)=>({id:'review-'+i})),passages:[{id:'cycle-fixture',questions:[{type:'detail'},{type:'inference'},{type:'main_idea'}]}],passageAttempts:attempts,listeningItems:[],listeningAttempts:[],speakingPrompts:[]};
 const saved=compactStudyState(state);assert.equal(saved.reviews.length,3500);assert.equal(saved.passageAttempts.length,70);assert.deepEqual(saved.passageAttempts[0].questionTypes,['inference','main_idea']);assert.equal(saved.passages.length,0);
});
