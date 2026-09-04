import test from 'node:test';
import assert from 'node:assert/strict';
import cycle from '../data/curated-cycle.json' with {type:'json'};
import questions from '../data/curated-questions.json' with {type:'json'};
test('all thirty reports have five specific questions with traceable supporting sentences',()=>{
  for(const passage of cycle.passages){const items=questions[passage.id];assert.equal(items.length,5);assert.equal(items.filter(q=>q.type==='detail').length,2);const sentences=passage.textFa.split(/(?<=[.!؟])\s+/u).filter(Boolean);
    for(const item of items){assert.ok(item.referenceAnswer);assert.ok(item.evidenceSentenceIndexes.length);assert.equal(item.evidenceFa,item.evidenceSentenceIndexes.map(i=>sentences[i]).join(' … '));assert.doesNotMatch(item.question,/sentence \d|What is the main idea of this report\?|How is the report organized\?/i);}
  }
});
