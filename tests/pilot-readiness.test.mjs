import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../db/014_pilot_instrumentation.sql',import.meta.url),'utf8');
const operations=readFileSync(new URL('../docs/PILOT_OPERATIONS.md',import.meta.url),'utf8');

test('pilot schema covers consent, intervention, assessments, QA, review, and releases',()=>{
 for(const name of ['learning_events','learning_event_classes','generation_quality_runs','content_human_reviews','deployment_releases','class_intervention_report','class_pilot_event_report','class_pilot_event_export','capture_class_pilot_assessment','content_review_queue','withdraw_from_learning_class','delete_my_pilot_data','purge_expired_pilot_class_data'])assert.match(migration,new RegExp(name));
 assert.match(migration,/consented_at is not null/u);assert.match(migration,/withdrawn_at is null/u);
});

test('operations contract covers privacy, deletion, incidents, and non-causal language',()=>{
 for(const phrase of ['Row-level security','Account deletion','Incident response','Do not report causal impact','not official ILR'])assert.match(operations,new RegExp(phrase,'i'));
});
