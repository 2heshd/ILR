-- Shared personal vocabulary for Asl, Cursos, and Synaptx.
-- Apply after db/supabase.sql in the Supabase SQL editor.

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

alter table public.platform_vocabulary enable row level security;

drop policy if exists "own vocabulary select" on public.platform_vocabulary;
drop policy if exists "own vocabulary insert" on public.platform_vocabulary;
drop policy if exists "own vocabulary update" on public.platform_vocabulary;
drop policy if exists "own vocabulary delete" on public.platform_vocabulary;

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
