import test from 'node:test';
import assert from 'node:assert/strict';
import {nextReviewWord,reviewWord} from '../lib/review-session.ts';
const word=(id,form)=>({id,normalizedForm:form,displayForm:form});
test('the displayed review word stays locked when the live due queue reorders',()=>{
 const a=word('a','الف'),b=word('b','ب'),newlyDue=word('c','ج');
 assert.equal(reviewWord([a,b,newlyDue],[newlyDue,a,b],a.normalizedForm),a);
});
test('a deliberate rating advances to the next queued word',()=>{
 const a=word('a','الف'),b=word('b','ب');
 assert.equal(nextReviewWord([a,b],'a'),b);
 assert.equal(nextReviewWord([a],'a'),undefined);
});
test('a deleted locked word safely falls back to the due queue',()=>{
 const a=word('a','الف'),b=word('b','ب');
 assert.equal(reviewWord([b],[b],a.normalizedForm),b);
});
