import test from 'node:test';
import assert from 'node:assert/strict';
import {checkSupportingVocabulary} from '../lib/practice-support.ts';
test('supporting verbs permit normal conjugation without counting each form again',()=>{
  assert.deepEqual(checkSupportingVocabulary('گفتم و گفتند',[],['گفتن']).issues,[]);
});
test('omitted labels are repaired only within the supporting-entry allowance',()=>{
  const result=checkSupportingVocabulary('کتاب خریدم',[],['کتاب']);
  assert.deepEqual(result.issues,[]);
  assert.deepEqual(result.words,['کتاب','خریدم']);
  assert.ok(checkSupportingVocabulary('کتاب خانه شهر مدرسه معلم دانشجو دانشگاه کلاس خودکار دفتر میز صندلی فردا امروز بازار خرید غذا دوست خریدم',[],[]).issues.length);
});
test('nineteen entries and passage-sized declarations fail',()=>{
  assert.ok(checkSupportingVocabulary('',[],['کتاب','خانه','مدرسه','معلم','درس','شهر','دانشجو','دانشگاه','کلاس','خودکار','دفتر','میز','صندلی','فردا','امروز','بازار','خرید','غذا','دوست']).issues.length);
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

test('malformed model labels cannot hide passage vocabulary and are repaired from the passage',()=>{
  const result=checkSupportingVocabulary('کتاب خریدم',[],['not Persian']);
  assert.deepEqual(result,{words:['کتاب','خریدم'],unknown:[],issues:[]});
});

test('common finite supporting verbs are stored as dictionary forms',()=>{
 const result=checkSupportingVocabulary('پزشک بیمار را معاینه کرد.',['پزشک','بیمار','معاینه'],['کرد']);
 assert.deepEqual(result,{words:['کردن'],unknown:[],issues:[]});
});
