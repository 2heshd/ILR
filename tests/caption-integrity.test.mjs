import test from 'node:test';
import assert from 'node:assert/strict';
import {captionsCoverText,nextCaption,reconcileCaptionSpellings} from '../lib/caption-integrity.js';
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
test('an observed Eid spelling mismatch can be repaired without losing timing or words',()=>{
  const input=[{word:'اید،',start:1,end:2}];
  assert.deepEqual(reconcileCaptionSpellings('عید',input),[{word:'عید،',start:1,end:2}]);
  assert.deepEqual(input,[{word:'اید،',start:1,end:2}]);
  assert.equal(captionsCoverText('عید عید',reconcileCaptionSpellings('عید عید',input)),false);
  assert.equal(captionsCoverText('دور',reconcileCaptionSpellings('دور',input)),false);
});
test('isolated recognizer spellings are aligned back to a mostly matching source',()=>{
 const source='صبح در خانهٔ ما سفره هفت سین تمیز بود و آجیل';
 const heard=['سبح','در','خانه','هما','سفره','هفت','سین','تمیز','بود','و','آجیل'].map((word,index)=>({word,start:index,end:index+0.5}));
 const repaired=reconcileCaptionSpellings(source,heard);
 assert.equal(captionsCoverText(source,repaired),true);
 assert.equal(repaired[0].word,'صبح');
 assert.equal(repaired[3].word,'ما');
 const unrelated=heard.map((item,index)=>({...item,word:`واژه${index}`}));
 assert.equal(captionsCoverText(source,reconcileCaptionSpellings(source,unrelated)),false);
});
