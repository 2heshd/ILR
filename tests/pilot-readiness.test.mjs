import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const migration=readFileSync(new URL('../db/014_pilot_instrumentation.sql',import.meta.url),'utf8');
const operations=readFileSync(new URL('../docs/PILOT_OPERATIONS.md',import.meta.url),'utf8');
const soak=readFileSync(new URL('../scripts/suite-soak.mjs',import.meta.url),'utf8');
const databaseSmoke=readFileSync(new URL('../scripts/pilot-db-smoke.sql',import.meta.url),'utf8');
const rlsPerformance=readFileSync(new URL('../db/015_rls_auth_initplan.sql',import.meta.url),'utf8');
const nextConfig=readFileSync(new URL('../next.config.mjs',import.meta.url),'utf8');
const mainPage=readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const printPage=readFileSync(new URL('../app/print/[kind]/[id]/page.tsx',import.meta.url),'utf8');

test('pilot schema covers consent, intervention, assessments, QA, review, and releases',()=>{
 for(const name of ['learning_events','learning_event_classes','generation_quality_runs','content_human_reviews','deployment_releases','class_intervention_report','class_pilot_event_report','class_generation_quality_report','class_pilot_event_export','capture_class_pilot_assessment','content_review_queue','withdraw_from_learning_class','delete_my_pilot_data','purge_expired_pilot_class_data'])assert.match(migration,new RegExp(name));
 assert.match(migration,/consented_at is not null/u);assert.match(migration,/withdrawn_at is null/u);
 assert.match(migration,/begin;[\s\S]*commit;\s*$/u);
});

test('suite soak fails closed and reports latency percentiles',()=>{
 assert.match(soak,/AbortSignal\.timeout\(10000\)/u);
 assert.match(soak,/response\.ok/u);
 assert.match(soak,/app-shell\.html\?page=syntax\.html/u);
 assert.match(soak,/route:'\/derivations'/u);
 assert.match(soak,/p50/u);assert.match(soak,/p95/u);
 assert.match(soak,/process\.exitCode=failures\.length\?1:0/u);
});

test('operations contract covers privacy, deletion, incidents, and non-causal language',()=>{
 for(const phrase of ['Row-level security','Account deletion','Incident response','Do not report causal impact','not official ILR'])assert.match(operations,new RegExp(phrase,'i'));
});

test('every pilot report is bound to the consented class event set',()=>{
 assert.match(migration,/g\.created_at>=m\.consented_at/u);
 assert.match(migration,/pec\.event_id=p\.id and pec\.class_id=target/u);
 assert.match(migration,/left join public\.learning_event_classes ec on ec\.class_id=target and ec\.user_id=m\.user_id/u);
 assert.match(migration,/a\.class_id=target and m\.consented_at is not null and m\.withdrawn_at is null/u);
});

test('pilot storage and review access fail closed at the database boundary',()=>{
 assert.match(migration,/pg_column_size\(metadata\) <= 16384/u);
 assert.match(migration,/cardinality\(supports_used\) <= 32/u);
 assert.match(migration,/length\(intervention_type\)<=80/u);
 assert.match(migration,/length\(intervention_id\)<=240/u);
 assert.match(migration,/cardinality\(issue_codes\)<=64/u);
 assert.match(migration,/pg_column_size\(content_payload\)<=262144/u);
 assert.match(migration,/length\(blocking_issue\)<=2000/u);
 assert.match(migration,/g\.created_at>=m\.consented_at/u);
 assert.match(migration,/grant select,insert,update on public\.deployment_releases to service_role/u);
 assert.equal((migration.match(/not public\.learning_can_manage_classes\(\)/gu)??[]).length,8);
 assert.match(migration,/delete from public\.learning_event_classes where class_id=target and user_id=auth\.uid\(\)/u);
 assert.match(migration,/delete from public\.pilot_assessments where class_id=target and user_id=auth\.uid\(\)/u);
 assert.match(migration,/delete from public\.learning_class_members where user_id=auth\.uid\(\)/u);
 assert.match(migration,/delete from public\.learning_class_members m using public\.learning_classes c/u);
 assert.match(migration,/revoke delete on public\.learning_class_members from authenticated/u);
 assert.match(migration,/revoke all on function public\.attach_learning_event_classes\(\) from public,anon,authenticated/u);
 assert.match(migration,/revoke all on function public\.handle_new_user\(\) from public,anon,authenticated/u);
 assert.match(migration,/update public\.learning_class_members set participant_code='P-'\|\|upper\(substr\(replace\(gen_random_uuid\(\)::text/u);
 assert.doesNotMatch(migration,/participant_code,consented_at,withdrawn_at\)[\s\S]{0,200}replace\(auth\.uid\(\)::text/u);
});

test('production database smoke is transactional and exercises isolation',()=>{
 for(const phrase of ['begin;','Cross-user event insert unexpectedly succeeded','Oversized generation review payload unexpectedly succeeded','Review queue crossed the consent boundary','Generation reliability report crossed the consent boundary','Non-owner report access unexpectedly succeeded','Direct membership deletion unexpectedly succeeded','Withdrawal retained class-linked evidence','Withdrawal retained class assessment data','Withdrawal retained membership identity','Post-withdrawal event was attached to a class','Rejoining exposed evidence from an earlier consent period','Rejoined event was not attached to its class','Pilot identity deletion failed','Retention purge did not remove all class-scoped records','Retention purge kept participant identity','Retention purge deleted learner-owned evidence','rollback;','pilot-db-smoke-passed'])assert.match(databaseSmoke,new RegExp(phrase,'i'));
});

test('row security evaluates authenticated identity once per statement',()=>{
  assert.match(rlsPerformance,/begin;[\s\S]*commit;/u);
  assert.equal((rlsPerformance.match(/alter policy/g)??[]).length,22);
  assert.doesNotMatch(rlsPerformance,/(?<!select )auth\.uid\(\)/u);
  for(const table of ['study_snapshots','review_events','profiles','platform_vocabulary','learning_notes','learning_classes','learning_class_members','learning_events','learning_event_classes','pilot_assessments','generation_quality_runs'])assert.match(rlsPerformance,new RegExp(`public\\.${table}`));
});

test('production generation smoke is synthetic, release-pinned, and bounded',()=>{
  const source=readFileSync(new URL('../scripts/production-generation-smoke.mjs',import.meta.url),'utf8');
  assert.match(source,/https:\/\/getcursos\.vercel\.app/);
  assert.match(source,/health\?\.release!==expectedRelease/);
  assert.match(source,/AbortSignal\.timeout\(30000\)/);
  assert.match(source,/practiceAnswerIssues/);
  assert.match(source,/captionsCoverText/);
  assert.doesNotMatch(source,/cookie|authorization/iu);
});

test('browser responses use the pilot security header baseline',()=>{
 for(const header of ['X-Content-Type-Options','Referrer-Policy','Permissions-Policy','X-Frame-Options'])assert.match(nextConfig,new RegExp(header));
});

test('learner-visible difficulty estimates are explicitly unofficial',()=>{
 assert.doesNotMatch(mainPage,/\bILR ~\{/u);
 assert.match(mainPage,/ILR-oriented, not an official rating/u);
 assert.match(printPage,/ILR-oriented, not an official rating/u);
});
