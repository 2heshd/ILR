-- Run this in the Supabase SQL editor for the MVP cloud layer.
-- Auth is managed by Supabase auth.users. App data is protected with RLS.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,24}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists profiles_username_lower_idx
  on public.profiles(lower(username));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'username', ''), 'user_' || substr(new.id::text, 1, 8))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

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

create table if not exists public.platform_vocabulary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_form text not null,
  normalized_form text not null,
  definition text,
  romanization text,
  source_platform text not null default 'cursos'
    check (source_platform in ('asl','cursos','synaptx')),
  source_context text,
  source_week integer not null default 1 check (source_week > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, normalized_form)
);

create index if not exists platform_vocabulary_user_time_idx
  on public.platform_vocabulary(user_id, created_at desc);

create index if not exists review_events_user_time_idx
  on public.review_events(user_id, reviewed_at desc);
create index if not exists review_events_word_time_idx
  on public.review_events(user_id, lexical_item_id, reviewed_at desc);

alter table public.study_snapshots enable row level security;
alter table public.review_events enable row level security;
alter table public.profiles enable row level security;
alter table public.platform_vocabulary enable row level security;
alter table public.platform_vocabulary replica identity full;

drop policy if exists "own snapshot select" on public.study_snapshots;
drop policy if exists "own snapshot insert" on public.study_snapshots;
drop policy if exists "own snapshot update" on public.study_snapshots;
drop policy if exists "own reviews select" on public.review_events;
drop policy if exists "own reviews insert" on public.review_events;
drop policy if exists "own profile select" on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
drop policy if exists "own vocabulary select" on public.platform_vocabulary;
drop policy if exists "own vocabulary insert" on public.platform_vocabulary;
drop policy if exists "own vocabulary update" on public.platform_vocabulary;
drop policy if exists "own vocabulary delete" on public.platform_vocabulary;

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

create policy "own profile select" on public.profiles
  for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles
  for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "own vocabulary select" on public.platform_vocabulary
  for select using (auth.uid() = user_id);
create policy "own vocabulary insert" on public.platform_vocabulary
  for insert with check (auth.uid() = user_id);
create policy "own vocabulary update" on public.platform_vocabulary
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own vocabulary delete" on public.platform_vocabulary
  for delete using (auth.uid() = user_id);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'platform_vocabulary'
    ) then
    alter publication supabase_realtime add table public.platform_vocabulary;
  end if;
end $$;
