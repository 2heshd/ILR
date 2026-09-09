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
test('attached possessives retain selected nouns without licensing unrelated nouns', () => {
  assert.deepEqual(unselectedContentWords('دوستم دوستت دوستش', ['دوست']), []);
  assert.deepEqual(unselectedContentWords('کتابم', ['دوست']), ['کتابم']);
});
test('transitions and spaced verb prefixes do not require new vocabulary',()=>{
  assert.deepEqual(unselectedContentWords('بعد من می خوانم و او نمی خواند', ['خواندن']),[]);
});
test('spoken verbs require their actual selected lemma',()=>{
  assert.deepEqual(unselectedContentWords('میخوام میرم نمیاد', ['خواستن','رفتن','آمدن']),[]);
  assert.deepEqual(unselectedContentWords('میخوام', ['خواندن']),['میخوام']);
});
test('irregular stems are recognized and noun endings are not invented verbs',()=>{
  assert.deepEqual(unselectedContentWords('میفروشد میشنوند مییابد', ['فروختن','شنیدن','یافتن']),[]);
  assert.deepEqual(unselectedContentWords('تهرام', ['تهران']),['تهرام']);
});
test('actual ChiMishe stem annotations are metadata, not compound components',()=>{
  assert.deepEqual(unselectedContentWords('من کتاب را میخوانم و او هم خواند', ['کتاب','خواندَن (خوان)']),[]);
  assert.deepEqual(unselectedContentWords('او حرف میزند', ['حرف زَدَن (زَن)']),[]);
  assert.deepEqual(unselectedContentWords('او میزند', ['حرف زَدَن (زَن)']),['میزند']);
});
test('prefixed verbs accept the aspect marker inside the preverb',()=>{
  assert.deepEqual(unselectedContentWords('برمیگردیم برنمیگردد برگشت', ['برگشتن (برگرد)']),[]);
  assert.deepEqual(unselectedContentWords('برمیگردیم', ['گردش']),['برمیگردیم']);
});
test('joined spelling of an explicitly selected multiword entry is licensed',()=>{
  assert.deepEqual(unselectedContentWords('خانه‌دار', ['خانِه ­دار']), []);
  assert.deepEqual(unselectedContentWords('خانه‌دار', ['خانه']), ['خانهدار']);
});
test('a selected compound allows its object marker without licensing a different verb use',()=>{
  assert.deepEqual(unselectedContentWords('این تصمیم را گرفت', ['تصمیم گرفتن']), []);
  assert.deepEqual(unselectedContentWords('کتاب را گرفت', ['تصمیم گرفتن','کتاب']), ['گرفت']);
  assert.deepEqual(unselectedContentWords('تصمیم. گرفت', ['تصمیم گرفتن']), ['گرفت']);
  assert.deepEqual(unselectedContentWords('تصمیم، گرفت', ['تصمیم گرفتن']), ['گرفت']);
});
test('vowel-final nouns retain their identity with linking-ye possessives',()=>{
  assert.deepEqual(unselectedContentWords('زانویش صدایم موهایت', ['زانو','صدا','مو']), []);
  assert.deepEqual(unselectedContentWords('زانویش', ['کتاب']), ['زانویش']);
  assert.deepEqual(unselectedContentWords('کتابیش', ['کتاب']), ['کتابیش']);
});
test('attested course infinitives license past forms without inventing present stems',()=>{
  assert.deepEqual(unselectedContentWords('ریخت ریخته ریختند افتاد بسته شکست', ['ریختن','افتادن','بستن','شکستن']), []);
  assert.deepEqual(unselectedContentWords('میریزد میافتد میبندد میشکند', ['ریختن','افتادن','بستن','شکستن']), []);
  assert.deepEqual(unselectedContentWords('ریخت', ['کتاب']), ['ریخت']);
  assert.deepEqual(unselectedContentWords('معد', ['معدن']), ['معد']);
});
test('existing grammatical auxiliaries retain allowance with aspect and negation',()=>{
  assert.deepEqual(unselectedContentWords('می‌شود نمی‌شد می‌باشند', []), []);
  assert.deepEqual(unselectedContentWords('می‌رود می‌دارد', []), ['میرود','میدارد']);
});

test('colloquial location and joined perfect auxiliaries remain grammatical',()=>{
 assert.deepEqual(unselectedContentWords('مردم توی شهر جمع شده‌اند.', ['مردم','شهر','جمع شدن']),[]);
});

test('basic numerals and counters can support concrete comprehension details',()=>{
 assert.deepEqual(unselectedContentWords('دو محله و پنج نفر', ['محله']),[]);
 assert.deepEqual(unselectedContentWords('دو محله و پنج پزشک', ['محله']),['پزشک']);
});
