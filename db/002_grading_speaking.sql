-- Optional normalized-schema expansion for automatic comprehension grading
-- and ILR-2 speaking maintenance. The MVP cloud snapshot already preserves
-- these fields inside StudyState; this migration keeps db/schema.sql's future
-- relational analytics path aligned with the app.

alter table if exists passage_attempts
  add column if not exists answers jsonb,
  add column if not exists grade jsonb,
  add column if not exists grading_mode text;

alter table if exists listening_attempts
  add column if not exists answers jsonb,
  add column if not exists grade jsonb,
  add column if not exists grading_mode text;

create table if not exists speaking_prompts (
  id uuid primary key default gen_random_uuid(),
  prompt_en text not null,
  prompt_fa text,
  topic text,
  ilr_target numeric(2,1) not null default 2.0,
  functions jsonb not null default '[]'::jsonb,
  target_words jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists speaking_attempts
  add column if not exists speaking_prompt_id uuid references speaking_prompts(id) on delete set null,
  add column if not exists transcript text,
  add column if not exists used_speech_recognition boolean not null default false,
  add column if not exists grading_mode text,
  add column if not exists grade jsonb,
  add column if not exists self_score double precision;

create index if not exists passage_attempts_user_time_idx
  on passage_attempts(user_id, attempted_at desc);
create index if not exists listening_attempts_user_time_idx
  on listening_attempts(user_id, attempted_at desc);
create index if not exists speaking_attempts_user_time_idx
  on speaking_attempts(user_id, attempted_at desc);
