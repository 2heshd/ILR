-- Shared pilot instrumentation for Cursos, SynaptX, and Aṣl.
-- Apply after 013_classroom_owner_only.sql.

create table if not exists public.learning_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  occurred_at timestamptz not null default now(),
  product text not null check (product in ('cursos','synaptx','asl')),
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  session_id uuid,
  source_item_id text,
  target_language text not null default 'fa' check (target_language in ('fa','ar','ru')),
  skill text check (skill is null or skill in ('vocabulary','reading','listening','speaking','morphology','syntax','verb','lexical_structure')),
  linguistic_concept text,
  problem_id uuid,
  intervention_type text,
  intervention_id uuid,
  related_event_id uuid references public.learning_events(id) on delete set null,
  correctness boolean,
  response_ms integer check (response_ms is null or response_ms between 0 and 3600000),
  attempt_number integer check (attempt_number is null or attempt_number between 1 and 10000),
  supports_used text[] not null default '{}',
  source_kind text,
  register text,
  difficulty numeric,
  course_week integer check (course_week is null or course_week between 0 and 520),
  topic text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
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
create unique index if not exists learning_class_participant_code_idx on public.learning_class_members(class_id,participant_code) where participant_code is not null;

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

create table if not exists public.generation_quality_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  product text not null default 'cursos' check(product in ('cursos','synaptx','asl')),
  modality text not null check(modality in ('reading','listening','speaking','analysis')),
  item_id text,
  content_hash text,
  model text,
  source_kind text,
  register text,
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
  issue_codes text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object')
);
create index if not exists generation_quality_time_idx on public.generation_quality_runs(created_at desc,product,modality);
alter table public.generation_quality_runs enable row level security;
drop policy if exists "own generation quality select" on public.generation_quality_runs;
drop policy if exists "own generation quality insert" on public.generation_quality_runs;
create policy "own generation quality select" on public.generation_quality_runs for select to authenticated using(auth.uid()=user_id);
create policy "own generation quality insert" on public.generation_quality_runs for insert to authenticated with check(auth.uid()=user_id);
grant select,insert on public.generation_quality_runs to authenticated;

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
  blocking_issue text,
  reviewed_at timestamptz not null default now(),
  unique(generation_run_id,reviewer_id)
);
alter table public.content_human_reviews enable row level security;
-- Review assignment is intentionally service/admin managed; no broad client policy.

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

create or replace function public.class_intervention_report(target uuid, days integer default 30) returns jsonb
language plpgsql security definer set search_path=public as $$
declare report jsonb;
begin
  if not exists(select 1 from public.learning_classes where id=target and owner_id=auth.uid()) then raise exception 'Class owner access required'; end if;
  select coalesce(jsonb_agg(row_to_json(rows)), '[]'::jsonb) into report from (
    with opted_in as (
      select user_id from public.learning_class_members
      where class_id=target and consented_at is not null and withdrawn_at is null
    ), interventions as (
      select e.* from public.learning_events e join opted_in m using(user_id)
      where e.intervention_id is not null and e.occurred_at>=now()-make_interval(days=>greatest(1,least(days,3650)))
    ), scored as (
      select i.user_id,i.intervention_id,i.linguistic_concept,i.occurred_at,
        (select avg(case when p.correctness then 1.0 else 0.0 end) from public.learning_events p where p.user_id=i.user_id and p.linguistic_concept is not distinct from i.linguistic_concept and p.correctness is not null and p.occurred_at<i.occurred_at and p.occurred_at>=i.occurred_at-interval '30 days') pre_accuracy,
        (select avg(p.response_ms) from public.learning_events p where p.user_id=i.user_id and p.linguistic_concept is not distinct from i.linguistic_concept and p.response_ms is not null and p.occurred_at<i.occurred_at and p.occurred_at>=i.occurred_at-interval '30 days') pre_latency,
        (select avg(case when p.correctness then 1.0 else 0.0 end) from public.learning_events p where p.user_id=i.user_id and p.linguistic_concept is not distinct from i.linguistic_concept and p.correctness is not null and p.occurred_at>i.occurred_at and p.occurred_at<=i.occurred_at+interval '30 days') post_accuracy,
        (select avg(p.response_ms) from public.learning_events p where p.user_id=i.user_id and p.linguistic_concept is not distinct from i.linguistic_concept and p.response_ms is not null and p.occurred_at>i.occurred_at and p.occurred_at<=i.occurred_at+interval '30 days') post_latency
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

create or replace function public.my_learning_event_export() returns setof public.learning_events
language sql security invoker set search_path=public as $$
  select * from public.learning_events where user_id=auth.uid() order by occurred_at,id;
$$;
revoke all on function public.my_learning_event_export() from public,anon;
grant execute on function public.my_learning_event_export() to authenticated;

