import test from 'node:test';
import assert from 'node:assert/strict';
import {readablePracticeEntry,practiceBank} from '../lib/practice-bank.ts';

test('prompt bank retains stem hints, alternatives and meanings without vowel clutter',()=>{
  assert.equal(readablePracticeEntry('خواندَن (خوان)'), 'خواندن (خوان)');
  assert.equal(readablePracticeEntry('مَدرک/ مَدارِک'), 'مدرک/ مدارک');
  const selected=['خواندَن (خوان)'];
  assert.deepEqual(practiceBank(selected,[{word:selected[0],meaning:'to read'},{word:'خانه',meaning:'house'}]),[{word:'خواندن (خوان)',meaning:'to read'}]);
  assert.deepEqual(selected,['خواندَن (خوان)']);
});
