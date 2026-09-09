import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {COURSE_TOPICS,PRACTICE_TOPICS,courseTopicFor} from '../lib/course-topics.ts';
test('topics cover every course entry with an explicit fallback',()=>{
 const {entries}=JSON.parse(readFileSync(new URL('../data/course-vocabulary.json',import.meta.url)));
 assert(entries.every(entry=>COURSE_TOPICS.includes(courseTopicFor(entry.en))));
 assert.equal(courseTopicFor('hospital'),'Health');
 assert.equal(courseTopicFor('train ticket'),'Travel & transport');
 assert.equal(courseTopicFor('yesterday'),'Other vocabulary');
 assert(!PRACTICE_TOPICS.includes('All topics'));
});
test('both practice modes send topic and keep history',()=>{
 const page=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
 assert(page.includes('topic:practiceTopic[kind]'));
 for(const kind of ['reading','listening']) assert(page.includes(`aria-label="${kind} topic"`));
 assert.equal((page.match(/<summary>Exercise history<\/summary>/g)||[]).length,2);
});
