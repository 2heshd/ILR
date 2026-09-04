create table if not exists public.learning_classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) default auth.uid(),
  name text not null check(char_length(name) between 1 and 100),
  join_code text not null unique default substr(replace(gen_random_uuid()::text,'-',''),1,24),
  created_at timestamptz not null default now()
);
create table if not exists public.learning_class_members (
  class_id uuid not null references public.learning_classes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  display_name text not null check(char_length(display_name) between 1 and 80),
  joined_at timestamptz not null default now(),
  primary key(class_id,user_id)
);
alter table public.learning_classes enable row level security;
alter table public.learning_class_members enable row level security;
create policy "Class owners" on public.learning_classes for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy "Member or class owner reads membership" on public.learning_class_members for select to authenticated using(user_id=auth.uid() or exists(select 1 from public.learning_classes c where c.id=class_id and c.owner_id=auth.uid()));
create policy "Learners leave their own class" on public.learning_class_members for delete to authenticated using(user_id=auth.uid());
grant select,insert,update,delete on public.learning_classes to authenticated;
grant select,delete on public.learning_class_members to authenticated;

create or replace function public.join_learning_class(code text, learner_name text) returns uuid
language plpgsql security definer set search_path=public as $$
declare target uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select id into target from public.learning_classes where join_code=code;
  if target is null then raise exception 'Invalid class code'; end if;
  insert into public.learning_class_members(class_id,user_id,display_name) values(target,auth.uid(),trim(learner_name))
    on conflict(class_id,user_id) do update set display_name=excluded.display_name;
  return target;
end $$;
revoke all on function public.join_learning_class(text,text) from public, anon;
grant execute on function public.join_learning_class(text,text) to authenticated;

-- Return aggregate practice evidence only, never private notes or raw answers.
create or replace function public.learning_class_report(target uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare report jsonb;
begin
  if not exists(select 1 from public.learning_classes where id=target and owner_id=auth.uid()) then raise exception 'Class owner access required'; end if;
  select coalesce(jsonb_agg(row_to_json(rows)), '[]'::jsonb) into report from (
    select m.display_name,m.user_id,
      count(e.id) as reviews,
      max(e.reviewed_at) as last_review,
      round(100.0*count(e.id) filter(where e.correct and e.modality='visual')/nullif(count(e.id) filter(where e.modality='visual'),0)) as text_retention,
      round(100.0*count(e.id) filter(where e.correct and e.modality='audio')/nullif(count(e.id) filter(where e.modality='audio'),0)) as audio_retention,
      round(100.0*count(e.id) filter(where e.correct and e.modality='cloze')/nullif(count(e.id) filter(where e.modality='cloze'),0)) as pattern_retention
    from public.learning_class_members m left join public.review_events e on e.user_id=m.user_id and e.reviewed_at>=now()-interval '7 days'
    where m.class_id=target group by m.display_name,m.user_id order by m.display_name
  ) rows;
  return report;
end $$;
revoke all on function public.learning_class_report(uuid) from public, anon;
grant execute on function public.learning_class_report(uuid) to authenticated;
