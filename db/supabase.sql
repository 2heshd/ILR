-- Run this in the Supabase SQL editor for the MVP cloud layer.
-- Auth is managed by Supabase auth.users. App data is protected with RLS.

create table if not exists public.study_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.review_events (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- text intentionally supports any legacy local IDs during migration.
  lexical_item_id text not null,
  reviewed_at timestamptz not null,
  modality text not null check (modality in ('visual','audio','production','cloze')),
  rating text not null check (rating in ('again','hard','good','easy')),
  correct boolean not null,
  response_ms integer not null,
  scheduler_state_before jsonb,
  scheduler_state_after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists review_events_user_time_idx
  on public.review_events(user_id, reviewed_at desc);
create index if not exists review_events_word_time_idx
  on public.review_events(user_id, lexical_item_id, reviewed_at desc);

alter table public.study_snapshots enable row level security;
alter table public.review_events enable row level security;

drop policy if exists "own snapshot select" on public.study_snapshots;
drop policy if exists "own snapshot insert" on public.study_snapshots;
drop policy if exists "own snapshot update" on public.study_snapshots;
drop policy if exists "own reviews select" on public.review_events;
drop policy if exists "own reviews insert" on public.review_events;

create policy "own snapshot select" on public.study_snapshots
  for select using (auth.uid() = user_id);
create policy "own snapshot insert" on public.study_snapshots
  for insert with check (auth.uid() = user_id);
create policy "own snapshot update" on public.study_snapshots
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own reviews select" on public.review_events
  for select using (auth.uid() = user_id);
create policy "own reviews insert" on public.review_events
  for insert with check (auth.uid() = user_id);
