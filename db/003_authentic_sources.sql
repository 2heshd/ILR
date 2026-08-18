-- Provenance and discourse classification for authentic/adapted/generated
-- reading and listening sources. The cloud snapshot remains the app's primary
-- persistence path; these columns support normalized longitudinal analytics.

alter table if exists passages
  add column if not exists source_title text,
  add column if not exists publisher text,
  add column if not exists published_at date,
  add column if not exists genre text,
  add column if not exists target_words jsonb not null default '[]'::jsonb,
  add column if not exists questions jsonb not null default '[]'::jsonb;

alter table if exists listening_items
  add column if not exists source_title text,
  add column if not exists publisher text,
  add column if not exists published_at date,
  add column if not exists genre text,
  add column if not exists media_url text,
  add column if not exists target_words jsonb not null default '[]'::jsonb,
  add column if not exists questions jsonb not null default '[]'::jsonb;

create index if not exists passages_provenance_idx
  on passages(source_type, publisher, genre, register);
create index if not exists listening_items_provenance_idx
  on listening_items(source_type, publisher, genre, register);
