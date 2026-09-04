import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {planCatalogTree} from '../lib/plan-catalog.ts';
const catalog=JSON.parse(readFileSync(new URL('../data/course-vocabulary.json',import.meta.url),'utf8')).entries;
test('planner exposes every catalog entry and all 154 lessons without a saved bank',()=>{
 const tree=planCatalogTree(catalog);
 const lessons=tree.flatMap(unit=>unit.chapters.flatMap(chapter=>chapter.lessons));
 assert.equal(lessons.length,154);
 const entries=lessons.flatMap(lesson=>lesson.entries);
 assert.equal(entries.length,6060);
 assert.deepEqual(entries.map(e=>e.id).sort((a,b)=>a-b),catalog.map(e=>e.id).sort((a,b)=>a-b));
 for(const unit of tree){assert.equal(unit.entries.length,unit.chapters.reduce((n,c)=>n+c.entries.length,0));}
 assert.ok(tree.some(unit=>unit.label==='Introductory Unit'));
 assert.ok(tree.some(unit=>unit.label==='Newspaper Book'));
});
test('units, chapters and lessons use numeric ordering',()=>{
 const entries=['Unit 10 - Chapter 20 - Lesson 10','Unit 2 - Chapter 10 - Lesson 2','Unit 2 - Chapter 2 - Lesson 10','Unit 2 - Chapter 2 - Lesson 2'].map((lesson,id)=>({lesson,id}));
 const tree=planCatalogTree(entries);
 assert.deepEqual(tree.map(u=>u.label),['Unit 2','Unit 10']);
 assert.deepEqual(tree[0].chapters.map(c=>c.label),['Chapter 2','Chapter 10']);
 assert.ok(tree[0].chapters[0].lessons[0].label.endsWith('Lesson 2'));
});
test('the full planner is only mounted in Vocabulary',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert.equal((page.match(/<StudyPlanPicker /g)||[]).length,1);
 assert.match(page,/tab === "vocabulary"[^\n]*\n\s*<StudyPlanPicker/);
 assert.match(page,/Edit plan in Vocabulary/);
});
