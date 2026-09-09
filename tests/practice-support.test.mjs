import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSupportingVocabulary} from '../lib/practice-support.ts';
test('supporting verbs permit normal conjugation without counting each form again',()=>{
  assert.deepEqual(checkSupportingVocabulary('گفتم و گفتند',[],['گفتن']).issues,[]);
});
test('omitted labels are repaired only within the five-entry allowance',()=>{
  const result=checkSupportingVocabulary('کتاب خریدم',[],['کتاب']);
  assert.deepEqual(result.issues,[]);
  assert.deepEqual(result.words,['کتاب','خریدم']);
  assert.ok(checkSupportingVocabulary('کتاب خانه شهر مدرسه معلم خریدم',[],['کتاب','خانه','شهر','مدرسه','معلم']).issues.length);
});
test('six entries and passage-sized declarations fail',()=>{
  assert.ok(checkSupportingVocabulary('',[],['کتاب','خانه','مدرسه','معلم','درس','شهر']).issues.length);
  assert.ok(checkSupportingVocabulary('',[],['من امروز به مدرسه رفتم و درس خواندم']).issues.length);
});
test('selected words mistakenly declared as new do not consume the allowance',()=>{
  const result=checkSupportingVocabulary('کتاب خریدم',['کتاب'],['کتاب']);
  assert.deepEqual(result.issues,[]);
  assert.deepEqual(result.words,['خریدم']);
});
test('unused supporting labels are removed without an AI repair',()=>{
  assert.deepEqual(checkSupportingVocabulary('کتاب',[],['کتاب','خانه']).words,['کتاب']);
});
