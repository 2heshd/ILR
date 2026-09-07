import test from 'node:test';
import assert from 'node:assert/strict';
import {unselectedContentWords} from '../lib/practice-vocabulary.ts';

test('selected verb stems retain initial letters that resemble prefixes',()=>{
  assert.deepEqual(unselectedContentWords('نوشت نوشتند می‌نویسد ننوشت بنویس برد بردند نشست', ['نوشتن','بردن','نشستن']),[]);
});
test('vowel marks do not split Persian words into separate tokens',()=>{
  assert.deepEqual(unselectedContentWords('کِتاب را خواند.', ['کتاب','خواندن']),[]);
});
test('accepting intact verb stems does not license unrelated content',()=>{
  assert.deepEqual(unselectedContentWords('مدرسه رفت', ['نوشتن']),['مدرسه','رفت']);
});
test('selected buying verb licenses its irregular present stem',()=>{
  assert.deepEqual(unselectedContentWords('می‌خرند بخرید نخرید می‌خریم', ['خریدن']),[]);
  assert.deepEqual(unselectedContentWords('می‌خرند', ['خواندن']),['میخرند']);
});
