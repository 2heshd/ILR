import test from 'node:test';
import assert from 'node:assert/strict';
import {practiceAnswerIssues,repairPracticeAnswerArticles} from '../lib/practice-answers.ts';
const questions=answer=>Array.from({length:3},()=>({question:'Where did the student go?',referenceAnswer:answer}));
test('generated answers do not invent gender for the Persian speaker',()=>{
  assert.equal(practiceAnswerIssues(questions('He went to his friend’s house.')).length,1);
  assert.deepEqual(practiceAnswerIssues(questions('The student went to their friend’s house.')),[]);
});
test('explicit family roles remain permitted',()=>{
  assert.deepEqual(practiceAnswerIssues(questions('The father is a colonel.')),[]);
});
test('missing answers and malformed question lists fail closed',()=>{
  assert.ok(practiceAnswerIssues(null).length);
  assert.ok(practiceAnswerIssues([{}, {}, {}]).length);
});
test('incorrect English indefinite articles are repaired deterministically',()=>{
 const broken=questions('A earthquake happened after a alarm.');
 assert.ok(practiceAnswerIssues(broken).length);
 const repaired=repairPracticeAnswerArticles(broken);
 assert.equal(repaired[0].referenceAnswer,'An earthquake happened after an alarm.');
 assert.deepEqual(practiceAnswerIssues(repaired),[]);
 assert.equal(repairPracticeAnswerArticles(questions('A university opened.'))[0].referenceAnswer,'A university opened.');
});
