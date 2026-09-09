-- Shared pilot instrumentation for Cursos, SynaptX, and Aṣl.
-- Apply after 013_classroom_owner_only.sql.

begin;

create table if not exists public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  occurred_at timestamptz not null default now(),
  product text not null check (product in ('cursos','synaptx','asl')),
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  session_id uuid,
  source_item_id text check (source_item_id is null or length(source_item_id) <= 240),
  target_language text not null default 'fa' check (target_language in ('fa','ar','ru')),
  skill text check (skill is null or skill in ('vocabulary','reading','listening','speaking','morphology','syntax','verb','lexical_structure')),
  linguistic_concept text check (linguistic_concept is null or length(linguistic_concept) <= 240),
  problem_id uuid,
  intervention_type text check(intervention_type is null or length(intervention_type)<=80),
  intervention_id text check(intervention_id is null or length(intervention_id)<=240),
  related_event_id uuid references public.learning_events(id) on delete set null,
  correctness boolean,
  response_ms integer check (response_ms is null or response_ms between 0 and 3600000),
  attempt_number integer check (attempt_number is null or attempt_number between 1 and 10000),
  supports_used text[] not null default '{}' check (cardinality(supports_used) <= 32),
  source_kind text check (source_kind is null or length(source_kind) <= 80),
  register text check (register is null or length(register) <= 80),
  difficulty numeric check(difficulty is null or difficulty between -1000 and 1000),
  course_week integer check (course_week is null or course_week between 0 and 520),
  topic text check (topic is null or length(topic) <= 240),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 16384),
  created_at timestamptz not null default now()
);

create index if not exists learning_events_user_time_idx on public.learning_events(user_id,occurred_at desc);
create index if not exists learning_events_concept_time_idx on public.learning_events(user_id,target_language,linguistic_concept,occurred_at);
create index if not exists learning_events_intervention_idx on public.learning_events(user_id,intervention_id,occurred_at) where intervention_id is not null;
create index if not exists learning_events_problem_idx on public.learning_events(user_id,problem_id,occurred_at) where problem_id is not null;
create index if not exists learning_events_type_time_idx on public.learning_events(event_type,occurred_at desc);

alter table public.learning_events enable row level security;
drop policy if exists "own learning events select" on public.learning_events;
drop policy if exists "own learning events insert" on public.learning_events;
drop policy if exists "own learning events delete" on public.learning_events;
create policy "own learning events select" on public.learning_events for select to authenticated using(auth.uid()=user_id);
create policy "own learning events insert" on public.learning_events for insert to authenticated with check(auth.uid()=user_id);
create policy "own learning events delete" on public.learning_events for delete to authenticated using(auth.uid()=user_id);
grant select,insert,delete on public.learning_events to authenticated;

alter table public.learning_classes add column if not exists target_language text not null default 'fa' check(target_language in ('fa','ar','ru'));
alter table public.learning_classes add column if not exists course_label text;
alter table public.learning_classes add column if not exists pilot_starts_on date;
alter table public.learning_classes add column if not exists pilot_ends_on date;
alter table public.learning_classes add column if not exists data_retention_days integer not null default 365 check(data_retention_days between 1 and 3650);

alter table public.learning_class_members add column if not exists participant_code text;
alter table public.learning_class_members add column if not exists consented_at timestamptz;
alter table public.learning_class_members add column if not exists withdrawn_at timestamptz;
update public.learning_class_members set participant_code='P-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)) where participant_code is null;
create unique index if not exists learning_class_participant_code_idx on public.learning_class_members(class_id,participant_code) where participant_code is not null;
drop policy if exists "Learners leave their own class" on public.learning_class_members;
revoke delete on public.learning_class_members from authenticated;

-- Freeze the class consent context at event time. Reports use this junction rather
-- than joining every event a learner has ever produced to every class they join.
create table if not exists public.learning_event_classes (
  event_id uuid not null references public.learning_events(id) on delete cascade,
  class_id uuid not null references public.learning_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key(event_id,class_id)
);
create index if not exists learning_event_classes_class_idx on public.learning_event_classes(class_id,user_id);
alter table public.learning_event_classes enable row level security;
drop policy if exists "own learning event class links select" on public.learning_event_classes;
create policy "own learning event class links select" on public.learning_event_classes for select to authenticated using(auth.uid()=user_id);
grant select on public.learning_event_classes to authenticated;

create or replace function public.attach_learning_event_classes() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  insert into public.learning_event_classes(event_id,class_id,user_id)
  select new.id,m.class_id,new.user_id from public.learning_class_members m
  where m.user_id=new.user_id and m.consented_at is not null and m.withdrawn_at is null
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists attach_learning_event_classes_after_insert on public.learning_events;
create trigger attach_learning_event_classes_after_insert after insert on public.learning_events for each row execute function public.attach_learning_event_classes();
insert into public.learning_event_classes(event_id,class_id,user_id)
select e.id,m.class_id,e.user_id from public.learning_events e join public.learning_class_members m on m.user_id=e.user_id
where m.consented_at is not null and m.withdrawn_at is null and e.occurred_at>=m.consented_at
on conflict do nothing;

create or replace function public.join_learning_class(code text, learner_name text) returns uuid
language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into target from public.learning_classes where join_code=code;
  if target is null then raise exception 'Invalid class code'; end if;
  insert into public.learning_class_members(class_id,user_id,display_name,participant_code,consented_at,withdrawn_at)
    values(target,auth.uid(),trim(learner_name),'P-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),now(),null)
  on conflict(class_id,user_id) do update set
    display_name=excluded.display_name,
    consented_at=case when learning_class_members.withdrawn_at is not null then now() else coalesce(learning_class_members.consented_at,now()) end,
    withdrawn_at=null;
  return target;
end $$;
revoke all on function public.join_learning_class(text,text) from public,anon;
grant execute on function public.join_learning_class(text,text) to authenticated;

create table if not exists public.pilot_assessments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.learning_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null check(period in ('baseline','midpoint','endline')),
  assessed_at timestamptz not null default now(),
  metrics jsonb not null default '{}'::jsonb check(jsonb_typeof(metrics)='object'),
  unique(class_id,user_id,period)
);
alter table public.pilot_assessments enable row level security;
drop policy if exists "learner reads own pilot assessments" on public.pilot_assessments;
create policy "learner reads own pilot assessments" on public.pilot_assessments for select to authenticated using(auth.uid()=user_id);
grant select on public.pilot_assessments to authenticated;

create or replace function public.withdraw_from_learning_class(target uuid) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not exists(select 1 from public.learning_class_members where class_id=target and user_id=auth.uid() and withdrawn_at is null) then
    raise exception 'Active membership not found';
  end if;
  delete from public.learning_event_classes where class_id=target and user_id=auth.uid();
  delete from public.pilot_assessments where class_id=target and user_id=auth.uid();
  delete from public.learning_class_members where class_id=target and user_id=auth.uid();
  if not found then raise exception 'Active membership not found'; end if;
end $$;
revoke all on function public.withdraw_from_learning_class(uuid) from public,anon;
grant execute on function public.withdraw_from_learning_class(uuid) to authenticated;

create table if not exists public.generation_quality_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  product text not null default 'cursos' check(product in ('cursos','synaptx','asl')),
  modality text not null check(modality in ('reading','listening','speaking','analysis')),
  item_id text check(item_id is null or length(item_id)<=240),
  content_hash text check(content_hash is null or length(content_hash)<=128),
  model text check(model is null or length(model)<=120),
  source_kind text check(source_kind is null or length(source_kind)<=80),
  register text check(register is null or length(register)<=80),
  latency_ms integer check(latency_ms is null or latency_ms between 0 and 3600000),
  schema_valid boolean not null default false,
  vocabulary_valid boolean,
  grammar_valid boolean,
  register_valid boolean,
  question_evidence_valid boolean,
  answers_valid boolean,
  duplicate_free boolean,
  provenance_valid boolean,
  release_status text not null check(release_status in ('generated','deterministically_valid','linguistically_reviewed','learner_visible','rejected')),
  issue_codes text[] not null default '{}' check(cardinality(issue_codes)<=64),
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object' and pg_column_size(metadata)<=16384)
);
alter table public.generation_quality_runs add column if not exists content_payload jsonb check(content_payload is null or (jsonb_typeof(content_payload)='object' and pg_column_size(content_payload)<=262144));
create index if not exists generation_quality_time_idx on public.generation_quality_runs(created_at desc,product,modality);
alter table public.generation_quality_runs enable row level security;
drop policy if exists "own generation quality select" on public.generation_quality_runs;
drop policy if exists "own generation quality insert" on public.generation_quality_runs;
create policy "own generation quality select" on public.generation_quality_runs for select to authenticated using(auth.uid()=user_id);
create policy "own generation quality insert" on public.generation_quality_runs for insert to authenticated with check(auth.uid()=user_id);
grant select,insert on public.generation_quality_runs to authenticated;

create or replace function public.delete_my_pilot_data() returns void
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  delete from public.generation_quality_runs where user_id=auth.uid();
  delete from public.pilot_assessments where user_id=auth.uid();
  delete from public.learning_events where user_id=auth.uid();
  delete from public.learning_class_members where user_id=auth.uid();
end $$;
revoke all on function public.delete_my_pilot_data() from public,anon;
grant execute on function public.delete_my_pilot_data() to authenticated;

create table if not exists public.content_human_reviews (
  id uuid primary key default gen_random_uuid(),
  generation_run_id uuid not null references public.generation_quality_runs(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  reviewer_role text not null check(reviewer_role in ('native_speaker','instructor','linguist')),
  verdict text not null check(verdict in ('accepted','minor_correction','major_correction','rejected')),
  language_natural boolean,
  linguistically_accurate boolean,
  pedagogically_useful boolean,
  would_use_in_instruction boolean,
  blocking_issue text check(blocking_issue is null or length(blocking_issue)<=2000),
  reviewed_at timestamptz not null default now(),
  unique(generation_run_id,reviewer_id)
);
alter table public.content_human_reviews enable row level security;
-- Review assignment is intentionally service/admin managed; no broad client policy.

create or replace function public.content_review_queue(target uuid, queue_limit integer default 25) returns jsonb
language plpgsql security definer set search_path=public as $$
declare report jsonb;
begin
  if not public.learning_can_manage_classes() or not exists(select 1 from public.learning_classes where id=target and owner_id=auth.uid()) then raise exception 'Class owner access required'; end if;
  select coalesce(jsonb_agg(row_to_json(x) order by x.created_at desc),'[]'::jsonb) into report from (
    select g.id,g.created_at,g.modality,g.source_kind,g.register,g.latency_ms,g.release_status,g.issue_codes,g.content_payload,
      r.verdict,r.reviewer_role,r.language_natural,r.linguistically_accurate,r.pedagogically_useful,r.would_use_in_instruction,r.blocking_issue,r.reviewed_at
    from public.generation_quality_runs g join public.learning_class_members m on m.user_id=g.user_id and m.class_id=target
    left join public.content_human_reviews r on r.generation_run_id=g.id and r.reviewer_id=auth.uid()
    where m.consented_at is not null and m.withdrawn_at is null and g.created_at>=m.consented_at and g.content_payload is not null
    order by g.created_at desc limit greatest(1,least(queue_limit,100))
  ) x;
  return report;
end $$;
revoke all on function public.content_review_queue(uuid,integer) from public,anon;
grant execute on function public.content_review_queue(uuid,integer) to authenticated;

create or replace function public.submit_content_human_review(run_id uuid, role text, review_verdict text, natural boolean, accurate boolean, useful boolean, usable boolean, issue text default null) returns uuid
language plpgsql security definer set search_path=public as $$
declare saved uuid;
begin
  if role not in ('native_speaker','instructor','linguist') or review_verdict not in ('accepted','minor_correction','major_correction','rejected') then raise exception 'Invalid review'; end if;
  if not public.learning_can_manage_classes() or not exists(select 1 from public.generation_quality_runs g join public.learning_class_members m on m.user_id=g.user_id join public.learning_classes c on c.id=m.class_id where g.id=run_id and c.owner_id=auth.uid() and m.consented_at is not null and m.withdrawn_at is null and g.created_at>=m.consented_at) then raise exception 'Review access required'; end if;
  insert into public.content_human_reviews(generation_run_id,reviewer_id,reviewer_role,verdict,language_natural,linguistically_accurate,pedagogically_useful,would_use_in_instruction,blocking_issue,reviewed_at)
  values(run_id,auth.uid(),role,review_verdict,natural,accurate,useful,usable,nullif(trim(issue),''),now())
  on conflict(generation_run_id,reviewer_id) do update set reviewer_role=excluded.reviewer_role,verdict=excluded.verdict,language_natural=excluded.language_natural,linguistically_accurate=excluded.linguistically_accurate,pedagogically_useful=excluded.pedagogically_useful,would_use_in_instruction=excluded.would_use_in_instruction,blocking_issue=excluded.blocking_issue,reviewed_at=excluded.reviewed_at
  returning id into saved; return saved;
end $$;
revoke all on function public.submit_content_human_review(uuid,text,text,boolean,boolean,boolean,boolean,text) from public,anon;
grant execute on function public.submit_content_human_review(uuid,text,text,boolean,boolean,boolean,boolean,text) to authenticated;

create table if not exists public.deployment_releases (
  id uuid primary key default gen_random_uuid(),
  product text not null check(product in ('cursos','synaptx','asl')),
  commit_sha text not null,
  deployed_at timestamptz not null,
  schema_version text not null,
  content_version text not null,
  test_summary jsonb not null default '{}'::jsonb,
  preview_url text,
  production_url text not null,
  smoke_status text not null check(smoke_status in ('pending','passed','failed')),
  unique(product,commit_sha)
);
alter table public.deployment_releases enable row level security;
drop policy if exists "authenticated release manifest read" on public.deployment_releases;
create policy "authenticated release manifest read" on public.deployment_releases for select to authenticated using(true);
grant select on public.deployment_releases to authenticated;
grant select,insert,update on public.deployment_releases to service_role;

create or replace function public.class_intervention_report(target uuid, days integer default 30) returns jsonb
language plpgsql security definer set search_path=public as $$
declare report jsonb;
begin
  if not public.learning_can_manage_classes() or not exists(select 1 from public.learning_classes where id=target and owner_id=auth.uid()) then raise exception 'Class owner access required'; end if;
  select coalesce(jsonb_agg(row_to_json(rows)), '[]'::jsonb) into report from (
    with opted_in as (
      select user_id from public.learning_class_members
      where class_id=target and consented_at is not null and withdrawn_at is null
    ), interventions as (
      select e.* from public.learning_events e join public.learning_event_classes ec on ec.event_id=e.id and ec.class_id=target join opted_in m using(user_id)
      where e.intervention_id is not null and e.occurred_at>=now()-make_interval(days=>greatest(1,least(days,3650)))
    ), scored as (
      select i.user_id,i.intervention_id,i.linguistic_concept,i.occurred_at,
        (select avg(case when p.correctness then 1.0 else 0.0 end) from public.learning_events p where p.user_id=i.user_id and p.linguistic_concept is not distinct from i.linguistic_concept and p.correctness is not null and p.occurred_at<i.occurred_at and p.occurred_at>=i.occurred_at-interval '30 days' and exists(select 1 from public.learning_event_classes pec where pec.event_id=p.id and pec.class_id=target)) pre_accuracy,
        (select avg(p.response_ms) from public.learning_events p where p.user_id=i.user_id and p.linguistic_concept is not distinct from i.linguistic_concept and p.response_ms is not null and p.occurred_at<i.occurred_at and p.occurred_at>=i.occurred_at-interval '30 days' and exists(select 1 from public.learning_event_classes pec where pec.event_id=p.id and pec.class_id=target)) pre_latency,
        (select avg(case when p.correctness then 1.0 else 0.0 end) from public.learning_events p where p.user_id=i.user_id and p.linguistic_concept is not distinct from i.linguistic_concept and p.correctness is not null and p.occurred_at>i.occurred_at and p.occurred_at<=i.occurred_at+interval '30 days' and exists(select 1 from public.learning_event_classes pec where pec.event_id=p.id and pec.class_id=target)) post_accuracy,
        (select avg(p.response_ms) from public.learning_events p where p.user_id=i.user_id and p.linguistic_concept is not distinct from i.linguistic_concept and p.response_ms is not null and p.occurred_at>i.occurred_at and p.occurred_at<=i.occurred_at+interval '30 days' and exists(select 1 from public.learning_event_classes pec where pec.event_id=p.id and pec.class_id=target)) post_latency
      from interventions i
    )
    select linguistic_concept,count(*) interventions,
      round(100*avg(pre_accuracy)) pre_accuracy,
      round(100*avg(post_accuracy)) post_accuracy,
      round(avg(pre_latency)) pre_latency_ms,
      round(avg(post_latency)) post_latency_ms
    from scored where pre_accuracy is not null or post_accuracy is not null
    group by linguistic_concept order by count(*) desc,linguistic_concept
  ) rows;
  return report;
end $$;
revoke all on function public.class_intervention_report(uuid,integer) from public,anon;
grant execute on function public.class_intervention_report(uuid,integer) to authenticated;

create or replace function public.class_pilot_event_report(target uuid, days integer default 30) returns jsonb
language plpgsql security definer set search_path=public as $$
declare report jsonb; since_time timestamptz;
begin
  if not public.learning_can_manage_classes() or not exists(select 1 from public.learning_classes where id=target and owner_id=auth.uid()) then raise exception 'Class owner access required'; end if;
  select case when days=0 then coalesce(pilot_starts_on::timestamptz,created_at) else now()-make_interval(days=>greatest(1,least(days,3650))) end into since_time from public.learning_classes where id=target;
  select jsonb_build_object(
    'since',since_time,
    'learners',coalesce((select jsonb_agg(row_to_json(x) order by x.participant_code) from (
      select m.participant_code,count(e.id) attempts,count(e.id) filter(where e.correctness) correct,
        round(avg(e.response_ms)) average_response_ms,count(distinct e.product) products_used,count(distinct date(e.occurred_at)) active_days
      from public.learning_class_members m left join public.learning_event_classes ec on ec.class_id=m.class_id and ec.user_id=m.user_id left join public.learning_events e on e.id=ec.event_id and e.occurred_at>=since_time
      where m.class_id=target and m.consented_at is not null and m.withdrawn_at is null
      group by m.user_id,m.participant_code
    ) x),'[]'::jsonb),
    'bottlenecks',coalesce((select jsonb_agg(row_to_json(x) order by x.accuracy nulls first,x.attempts desc) from (
      select e.product,e.skill,e.linguistic_concept,count(*) attempts,count(*) filter(where e.correctness) correct,
        round(100.0*count(*) filter(where e.correctness)/nullif(count(*) filter(where e.correctness is not null),0)) accuracy,
        round(avg(e.response_ms)) average_response_ms
      from public.learning_events e join public.learning_event_classes ec on ec.event_id=e.id and ec.class_id=target join public.learning_class_members m on m.user_id=e.user_id and m.class_id=target
      where e.occurred_at>=since_time and m.consented_at is not null and m.withdrawn_at is null
      group by e.product,e.skill,e.linguistic_concept having count(*)>=3 order by accuracy nulls first,attempts desc limit 20
    ) x),'[]'::jsonb)
  ) into report;
  return report;
end $$;
revoke all on function public.class_pilot_event_report(uuid,integer) from public,anon;
grant execute on function public.class_pilot_event_report(uuid,integer) to authenticated;

create or replace function public.class_generation_quality_report(target uuid, days integer default 30) returns jsonb
language plpgsql security definer set search_path=public as $$
declare report jsonb; since_time timestamptz;
begin
  if not public.learning_can_manage_classes() or not exists(select 1 from public.learning_classes where id=target and owner_id=auth.uid()) then raise exception 'Class owner access required'; end if;
  select case when days=0 then coalesce(pilot_starts_on::timestamptz,created_at) else now()-make_interval(days=>greatest(1,least(days,3650))) end into since_time from public.learning_classes where id=target;
  with eligible as (
    select g.* from public.generation_quality_runs g join public.learning_class_members m on m.user_id=g.user_id and m.class_id=target
    where m.consented_at is not null and m.withdrawn_at is null and g.created_at>=m.consented_at and g.created_at>=since_time
  ), totals as (
    select count(*) total,count(*) filter(where release_status='learner_visible') learner_visible,count(*) filter(where release_status='rejected') rejected,
      round(100.0*count(*) filter(where release_status='learner_visible')/nullif(count(*),0)) success_rate,
      round(percentile_cont(.5) within group(order by latency_ms) filter(where latency_ms is not null)) p50_latency_ms,
      round(percentile_cont(.95) within group(order by latency_ms) filter(where latency_ms is not null)) p95_latency_ms
    from eligible
  )
  select jsonb_build_object('since',since_time,'total',total,'learner_visible',learner_visible,'rejected',rejected,'success_rate',success_rate,
    'p50_latency_ms',p50_latency_ms,'p95_latency_ms',p95_latency_ms,
    'by_modality',coalesce((select jsonb_agg(row_to_json(x) order by x.modality,x.source_kind,x.register) from (
      select modality,source_kind,register,count(*) total,count(*) filter(where release_status='learner_visible') learner_visible,
        count(*) filter(where release_status='rejected') rejected,round(percentile_cont(.95) within group(order by latency_ms) filter(where latency_ms is not null)) p95_latency_ms
      from eligible group by modality,source_kind,register
    ) x),'[]'::jsonb)) into report from totals;
  return report;
end $$;
revoke all on function public.class_generation_quality_report(uuid,integer) from public,anon;
grant execute on function public.class_generation_quality_report(uuid,integer) to authenticated;

create or replace function public.capture_class_pilot_assessment(target uuid, assessment_period text) returns integer
language plpgsql security definer set search_path=public as $$
declare saved integer;
begin
  if assessment_period not in ('baseline','midpoint','endline') then raise exception 'Invalid assessment period'; end if;
  if not public.learning_can_manage_classes() or not exists(select 1 from public.learning_classes where id=target and owner_id=auth.uid()) then raise exception 'Class owner access required'; end if;
  insert into public.pilot_assessments(class_id,user_id,period,metrics,assessed_at)
  select target,m.user_id,assessment_period,jsonb_build_object(
    'events',count(e.id),'scored_events',count(e.id) filter(where e.correctness is not null),
    'accuracy',round(100.0*count(e.id) filter(where e.correctness)/nullif(count(e.id) filter(where e.correctness is not null),0)),
    'median_response_ms',percentile_cont(.5) within group(order by e.response_ms) filter(where e.response_ms is not null),
    'active_days',count(distinct date(e.occurred_at))
  ),now()
  from public.learning_class_members m left join public.learning_event_classes ec on ec.class_id=target and ec.user_id=m.user_id left join public.learning_events e on e.id=ec.event_id
  where m.class_id=target and m.consented_at is not null and m.withdrawn_at is null group by m.user_id
  on conflict(class_id,user_id,period) do update set metrics=excluded.metrics,assessed_at=excluded.assessed_at;
  get diagnostics saved=row_count; return saved;
end $$;
revoke all on function public.capture_class_pilot_assessment(uuid,text) from public,anon;
grant execute on function public.capture_class_pilot_assessment(uuid,text) to authenticated;

create or replace function public.class_pilot_assessment_report(target uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare report jsonb;
begin
  if not public.learning_can_manage_classes() or not exists(select 1 from public.learning_classes where id=target and owner_id=auth.uid()) then raise exception 'Class owner access required'; end if;
  select coalesce(jsonb_agg(row_to_json(x) order by x.participant_code,x.period),'[]'::jsonb) into report from (
    select m.participant_code,a.period,a.assessed_at,a.metrics from public.pilot_assessments a join public.learning_class_members m on m.class_id=a.class_id and m.user_id=a.user_id where a.class_id=target and m.consented_at is not null and m.withdrawn_at is null and a.assessed_at>=m.consented_at
  ) x;
  return report;
end $$;
revoke all on function public.class_pilot_assessment_report(uuid) from public,anon;
grant execute on function public.class_pilot_assessment_report(uuid) to authenticated;

create or replace function public.my_learning_event_export() returns setof public.learning_events
language sql security invoker set search_path=public as $$
  select * from public.learning_events where user_id=auth.uid() order by occurred_at,id;
$$;
revoke all on function public.my_learning_event_export() from public,anon;
grant execute on function public.my_learning_event_export() to authenticated;

create or replace function public.class_pilot_event_export(target uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare report jsonb;
begin
  if not public.learning_can_manage_classes() or not exists(select 1 from public.learning_classes where id=target and owner_id=auth.uid()) then raise exception 'Class owner access required'; end if;
  select coalesce(jsonb_agg(row_to_json(x) order by x.occurred_at,x.event_id),'[]'::jsonb) into report from (
    select m.participant_code,e.id event_id,e.occurred_at,e.product,e.event_type,e.target_language,e.skill,e.linguistic_concept,
      e.intervention_type,e.intervention_id,e.related_event_id,e.correctness,e.response_ms,e.attempt_number,e.supports_used,
      e.source_kind,e.register,e.difficulty,e.course_week,e.topic
    from public.learning_events e join public.learning_event_classes ec on ec.event_id=e.id and ec.class_id=target
    join public.learning_class_members m on m.class_id=target and m.user_id=e.user_id
    where m.consented_at is not null and m.withdrawn_at is null
  ) x;
  return report;
end $$;
revoke all on function public.class_pilot_event_export(uuid) from public,anon;
grant execute on function public.class_pilot_event_export(uuid) to authenticated;

create or replace function public.purge_expired_pilot_class_data() returns integer
language plpgsql security definer set search_path=public as $$
declare removed integer:=0; step_removed integer;
begin
  delete from public.learning_event_classes ec using public.learning_classes c
  where ec.class_id=c.id and c.pilot_ends_on is not null and now()>=c.pilot_ends_on::timestamptz+make_interval(days=>c.data_retention_days);
  get diagnostics step_removed=row_count; removed:=removed+step_removed;
  delete from public.pilot_assessments a using public.learning_classes c
  where a.class_id=c.id and c.pilot_ends_on is not null and now()>=c.pilot_ends_on::timestamptz+make_interval(days=>c.data_retention_days);
  get diagnostics step_removed=row_count; removed:=removed+step_removed;
  delete from public.learning_class_members m using public.learning_classes c
  where m.class_id=c.id and c.pilot_ends_on is not null and now()>=c.pilot_ends_on::timestamptz+make_interval(days=>c.data_retention_days);
  get diagnostics step_removed=row_count; removed:=removed+step_removed;
  return removed;
end $$;
revoke all on function public.purge_expired_pilot_class_data() from public,anon,authenticated;
grant execute on function public.purge_expired_pilot_class_data() to service_role;

commit;
