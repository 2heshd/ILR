create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  display_name text,
  timezone text not null default 'America/Los_Angeles',
  target_reading_ilr numeric(2,1) not null default 4.0,
  target_listening_ilr numeric(2,1) not null default 3.5,
  target_speaking_ilr numeric(2,1) not null default 2.0,
  course_start_date date,
  course_end_date date,
  created_at timestamptz not null default now()
);

create table if not exists lexical_items (
  id uuid primary key default gen_random_uuid(),
  normalized_form text not null,
  display_form text not null,
  romanization text,
  lemma text,
  part_of_speech text,
  primary_definition text,
  register text,
  topic text,
  source_type text not null check (source_type in ('course','dli','system_advanced','user')),
  source_week integer not null,
  formal_variant text,
  colloquial_variant text,
  notes text,
  created_at timestamptz not null default now()
);
create unique index if not exists lexical_items_normalized_form_idx on lexical_items(normalized_form);

create table if not exists weekly_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  week_number integer not null,
  lexical_item_id uuid not null references lexical_items(id) on delete cascade,
  required boolean not null default true,
  added_by_system boolean not null default false,
  introduced_at timestamptz not null default now(),
  unique(user_id, week_number, lexical_item_id)
);

create table if not exists review_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  lexical_item_id uuid not null references lexical_items(id) on delete cascade,
  reviewed_at timestamptz not null default now(),
  modality text not null check (modality in ('visual','audio','production','cloze')),
  rating text not null check (rating in ('again','hard','good','easy')),
  correct boolean not null,
  response_ms integer not null,
  confidence smallint,
  scheduler_state_before jsonb,
  scheduler_state_after jsonb,
  due_before timestamptz,
  due_after timestamptz,
  session_id uuid
);
create index if not exists review_events_user_time_idx on review_events(user_id, reviewed_at desc);
create index if not exists review_events_word_idx on review_events(user_id, lexical_item_id, reviewed_at desc);

create table if not exists mastery_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  lexical_item_id uuid not null references lexical_items(id) on delete cascade,
  modality text not null,
  stability double precision,
  difficulty double precision,
  due_at timestamptz not null default now(),
  lapses integer not null default 0,
  total_reviews integer not null default 0,
  recent_accuracy double precision,
  median_response_ms integer,
  last_review_at timestamptz,
  status text not null default 'learning',
  unique(user_id, lexical_item_id, modality)
);

create table if not exists passages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  text_fa text not null,
  source_type text not null check (source_type in ('generated','authentic','adapted')),
  source_url text,
  source_title text,
  publisher text,
  published_at date,
  ilr_estimate numeric(2,1),
  topic text,
  genre text,
  register text,
  target_words jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  word_count integer,
  created_at timestamptz not null default now()
);

create table if not exists passage_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  passage_id uuid not null references passages(id) on delete cascade,
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_ms integer,
  comprehension_score double precision,
  inference_score double precision,
  discourse_score double precision,
  unknown_word_count integer,
  rereads integer not null default 0,
  self_rating smallint,
  notes text
);

create table if not exists listening_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  transcript_fa text,
  audio_url text not null,
  source_type text not null,
  source_url text,
  source_title text,
  publisher text,
  published_at date,
  genre text,
  media_url text,
  target_words jsonb not null default '[]'::jsonb,
  questions jsonb not null default '[]'::jsonb,
  ilr_estimate numeric(2,1),
  topic text,
  register text,
  speed_factor double precision not null default 1.0,
  noise_level double precision not null default 0,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create table if not exists listening_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  listening_item_id uuid not null references listening_items(id) on delete cascade,
  attempted_at timestamptz not null default now(),
  listens_count integer not null default 1,
  comprehension_score double precision,
  detail_score double precision,
  inference_score double precision,
  response_latency_ms integer,
  speed_factor double precision not null default 1.0,
  transcript_revealed boolean not null default false,
  notes text
);

create table if not exists exposure_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  lexical_item_id uuid not null references lexical_items(id) on delete cascade,
  exposure_type text not null,
  content_id uuid,
  occurred_at timestamptz not null default now(),
  noticed boolean,
  understood boolean
);

create table if not exists speaking_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  prompt_text text not null,
  attempted_at timestamptz not null default now(),
  duration_ms integer,
  task_completion double precision,
  intelligibility double precision,
  grammatical_control double precision,
  vocabulary_control double precision,
  fluency double precision,
  recording_url text,
  notes text
);
