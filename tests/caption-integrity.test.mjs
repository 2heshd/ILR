import test from 'node:test';
import assert from 'node:assert/strict';
import {captionsCoverText,nextCaption} from '../lib/caption-integrity.js';
const cues=[{word:'من',start:0,end:0},{word:'می‌روم',start:0.01,end:0.02},{word:'خانه',start:0.04,end:1}];
test('all elapsed words survive delayed frames and zero duration cues',()=>{
  assert.deepEqual(nextCaption(cues,-1,0.1),{index:2,word:'من می‌روم خانه'});
  assert.equal(nextCaption(cues,2,0.2).word,null);
});
test('missing repeated words are rejected',()=>{
  assert.equal(captionsCoverText('من من می‌روم خانه',cues),false);
  assert.equal(captionsCoverText('من می روم، خانه!',cues),true);
});
test('invalid and unordered timings are rejected',()=>{
  assert.equal(captionsCoverText('خانه من',[cues[2],cues[0]]),false);
  assert.equal(captionsCoverText('من',[{word:'من',start:NaN,end:1}]),false);
});
