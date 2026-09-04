-- Apply once to the existing shared Supabase project. Never import real student
-- records until the institution approves the service and its data handling.
create table if not exists public.learning_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  kind text not null check (kind in ('syntax','morphology')),
  rule text not null check (char_length(rule) between 1 and 8000),
  example text not null default '' check (char_length(example)<=2000),
  meaning text not null default '' check (char_length(meaning)<=2000),
  updated_at timestamptz not null default now()
);
alter table public.learning_notes enable row level security;
create policy "Own notebook only" on public.learning_notes for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
grant select,insert,update,delete on public.learning_notes to authenticated;
