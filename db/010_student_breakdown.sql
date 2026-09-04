-- More detail from the same opt-in seven-day practice evidence. No raw answers,
-- word identities, private notes, or additional student records are returned.
create or replace function public.learning_class_report(target uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare report jsonb;
begin
  if not exists(select 1 from public.learning_classes where id=target and owner_id=auth.uid()) then raise exception 'Class owner access required'; end if;
  with members as (select * from public.learning_class_members where class_id=target),
  events as (
    select e.* from public.review_events e join members m on m.user_id=e.user_id
    where e.reviewed_at >= (date_trunc('day',now() at time zone 'UTC')-interval '6 days') at time zone 'UTC' and e.reviewed_at<=now()
  ), rows as (
    select m.user_id,m.display_name,
      (select count(*) from events e where e.user_id=m.user_id) as reviews,
      (select max(reviewed_at) from events e where e.user_id=m.user_id) as last_review,
      (select count(distinct (reviewed_at at time zone 'UTC')::date) from events e where e.user_id=m.user_id) as active_days,
      (select count(distinct lexical_item_id) from events e where e.user_id=m.user_id) as unique_words,
      (select round(100.0*count(*) filter(where correct)/nullif(count(*),0)) from events e where e.user_id=m.user_id and modality='visual') as text_retention,
      (select round(100.0*count(*) filter(where correct)/nullif(count(*),0)) from events e where e.user_id=m.user_id and modality='audio') as audio_retention,
      (select round(100.0*count(*) filter(where correct)/nullif(count(*),0)) from events e where e.user_id=m.user_id and modality='cloze') as pattern_retention,
      (select jsonb_agg(to_jsonb(s)) from (
        select mode.modality,count(e.id) as attempts,count(e.id) filter(where e.correct) as correct,count(distinct e.lexical_item_id) as words,
          (select count(*) from (select x.lexical_item_id from events x where x.user_id=m.user_id and x.modality=mode.modality and not x.correct group by x.lexical_item_id having count(*)>=2) missed) as repeated_misses,
          count(e.id) filter(where (e.reviewed_at at time zone 'UTC')::date < (now() at time zone 'UTC')::date-2) as early_attempts,
          count(e.id) filter(where e.correct and (e.reviewed_at at time zone 'UTC')::date < (now() at time zone 'UTC')::date-2) as early_correct,
          count(e.id) filter(where (e.reviewed_at at time zone 'UTC')::date >= (now() at time zone 'UTC')::date-2) as recent_attempts,
          count(e.id) filter(where e.correct and (e.reviewed_at at time zone 'UTC')::date >= (now() at time zone 'UTC')::date-2) as recent_correct
        from (values ('visual'),('audio'),('cloze')) mode(modality)
        left join events e on e.user_id=m.user_id and e.modality=mode.modality
        group by mode.modality order by mode.modality
      ) s) as skills,
      (select jsonb_agg(to_jsonb(d) order by d.day) from (
        select day::date::text as day,count(e.id) as attempts,count(e.id) filter(where e.correct) as correct
        from generate_series((now() at time zone 'UTC')::date-6,(now() at time zone 'UTC')::date,interval '1 day') day
        left join events e on e.user_id=m.user_id and (e.reviewed_at at time zone 'UTC')::date=day::date
        group by day
      ) d) as daily
    from members m
  ) select coalesce(jsonb_agg(to_jsonb(rows) order by display_name),'[]'::jsonb) into report from rows;
  return report;
end $$;
revoke all on function public.learning_class_report(uuid) from public,anon;
grant execute on function public.learning_class_report(uuid) to authenticated;
