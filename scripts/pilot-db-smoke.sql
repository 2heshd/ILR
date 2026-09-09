-- Transactional production smoke test for db/014_pilot_instrumentation.sql.
-- Run with the Supabase Management API as the database owner. Every fixture is
-- rolled back; a raised exception fails the release gate.
begin;

insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values
  ('7f010000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pilot-smoke-owner@example.invalid','',now(),'{}','{}',now(),now()),
  ('7f010000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pilot-smoke-learner@example.invalid','',now(),'{}','{}',now(),now())
on conflict(id) do nothing;

insert into public.learning_classes(id,owner_id,name,join_code,target_language,course_label,pilot_starts_on,pilot_ends_on,data_retention_days)
values('7f020000-0000-4000-8000-000000000001','7f010000-0000-4000-8000-000000000001','Pilot smoke','pilot-smoke-code','fa','Smoke course',current_date,current_date+30,30);

insert into public.learning_class_members(class_id,user_id,display_name,participant_code,consented_at,withdrawn_at)
values('7f020000-0000-4000-8000-000000000001','7f010000-0000-4000-8000-000000000002','Pilot learner','P-SMOKE',now()-interval '1 minute',null);

-- A pre-consent generation must never enter the human-review queue.
insert into public.generation_quality_runs(id,user_id,created_at,modality,schema_valid,release_status,content_payload)
values('7f030000-0000-4000-8000-000000000001','7f010000-0000-4000-8000-000000000002',now()-interval '2 minutes','reading',true,'learner_visible','{"textFa":"pre-consent"}');

set local role authenticated;
select set_config('request.jwt.claim.sub','7f010000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"7f010000-0000-4000-8000-000000000002","role":"authenticated"}',true);

do $$
declare own_event uuid; current_run uuid;
begin
  insert into public.learning_events(user_id,product,event_type,skill,linguistic_concept,correctness,response_ms,metadata)
  values(auth.uid(),'cursos','pilot_smoke','reading','consent_boundary',true,900,'{"bounded":true}') returning id into own_event;
  if not exists(select 1 from public.learning_event_classes where event_id=own_event and class_id='7f020000-0000-4000-8000-000000000001') then
    raise exception 'Consented event was not attached to its class';
  end if;

  begin
    insert into public.learning_events(user_id,product,event_type) values('7f010000-0000-4000-8000-000000000001','cursos','foreign_write');
    raise exception 'Cross-user event insert unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.learning_events(product,event_type,metadata) values('cursos','oversized_metadata',jsonb_build_object('value',repeat('x',17000)));
    raise exception 'Oversized event metadata unexpectedly succeeded';
  exception when check_violation then null;
  end;

  insert into public.generation_quality_runs(user_id,modality,schema_valid,vocabulary_valid,grammar_valid,register_valid,question_evidence_valid,answers_valid,duplicate_free,release_status,content_payload)
  values(auth.uid(),'listening',true,true,true,true,true,true,true,'learner_visible','{"textFa":"current"}') returning id into current_run;
  perform set_config('pilot.smoke.current_run',current_run::text,true);

  if (select count(*) from public.my_learning_event_export())<>1 then raise exception 'Own event export was not isolated'; end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','7f010000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"7f010000-0000-4000-8000-000000000001","role":"authenticated"}',true);

do $$
declare queue jsonb; report jsonb; review_id uuid; saved integer; current_run uuid:=current_setting('pilot.smoke.current_run')::uuid;
begin
  queue:=public.content_review_queue('7f020000-0000-4000-8000-000000000001',25);
  if jsonb_array_length(queue)<>1 or queue->0->>'id'<>current_run::text then raise exception 'Review queue crossed the consent boundary'; end if;

  review_id:=public.submit_content_human_review(current_run,'instructor','accepted',true,true,true,true,null);
  if review_id is null then raise exception 'Human review was not saved'; end if;
  begin
    perform public.submit_content_human_review('7f030000-0000-4000-8000-000000000001','instructor','accepted',true,true,true,true,null);
    raise exception 'Pre-consent review unexpectedly succeeded';
  exception when others then
    if sqlerrm='Pre-consent review unexpectedly succeeded' then raise; end if;
  end;

  report:=public.class_pilot_event_report('7f020000-0000-4000-8000-000000000001',30);
  if jsonb_array_length(report->'learners')<>1 then raise exception 'Consented learner missing from report'; end if;
  saved:=public.capture_class_pilot_assessment('7f020000-0000-4000-8000-000000000001','baseline');
  if saved<>1 or jsonb_array_length(public.class_pilot_assessment_report('7f020000-0000-4000-8000-000000000001'))<>1 then
    raise exception 'Pilot assessment capture/report failed';
  end if;
end $$;

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','7f010000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"7f010000-0000-4000-8000-000000000002","role":"authenticated"}',true);

do $$
declare detached uuid; rejoined uuid; linked_before_withdrawal integer;
begin
  begin
    perform public.class_pilot_event_report('7f020000-0000-4000-8000-000000000001',30);
    raise exception 'Non-owner report access unexpectedly succeeded';
  exception when others then
    if sqlerrm='Non-owner report access unexpectedly succeeded' then raise; end if;
  end;

  select count(*) into linked_before_withdrawal from public.learning_event_classes where class_id='7f020000-0000-4000-8000-000000000001' and user_id=auth.uid();
  if linked_before_withdrawal<>1 then raise exception 'Withdrawal fixture did not contain one class-linked event'; end if;
  perform public.withdraw_from_learning_class('7f020000-0000-4000-8000-000000000001');
  if exists(select 1 from public.learning_event_classes where class_id='7f020000-0000-4000-8000-000000000001' and user_id=auth.uid()) then raise exception 'Withdrawal retained class-linked evidence'; end if;
  if exists(select 1 from public.pilot_assessments where class_id='7f020000-0000-4000-8000-000000000001' and user_id=auth.uid()) then raise exception 'Withdrawal retained class assessment data'; end if;
  if exists(select 1 from public.learning_class_members where class_id='7f020000-0000-4000-8000-000000000001' and user_id=auth.uid()) then raise exception 'Withdrawal retained membership identity'; end if;
  insert into public.learning_events(product,event_type) values('asl','post_withdrawal') returning id into detached;
  if exists(select 1 from public.learning_event_classes where event_id=detached) then raise exception 'Post-withdrawal event was attached to a class'; end if;
  perform public.join_learning_class('pilot-smoke-code','Delete me');
  if exists(select 1 from public.learning_event_classes ec join public.learning_events e on e.id=ec.event_id where ec.class_id='7f020000-0000-4000-8000-000000000001' and ec.user_id=auth.uid() and e.event_type in ('pilot_smoke','post_withdrawal')) then
    raise exception 'Rejoining exposed evidence from an earlier consent period';
  end if;
  insert into public.learning_events(product,event_type) values('asl','post_rejoin') returning id into rejoined;
  if not exists(select 1 from public.learning_event_classes where event_id=rejoined and class_id='7f020000-0000-4000-8000-000000000001') then raise exception 'Rejoined event was not attached to its class'; end if;
  perform public.delete_my_pilot_data();
  if exists(select 1 from public.learning_events where user_id=auth.uid()) then raise exception 'Learner event deletion failed'; end if;
  if exists(select 1 from public.learning_class_members where user_id=auth.uid()) then raise exception 'Pilot identity deletion failed'; end if;
end $$;

reset role;

insert into public.learning_classes(id,owner_id,name,join_code,target_language,course_label,pilot_starts_on,pilot_ends_on,data_retention_days)
values('7f020000-0000-4000-8000-000000000002','7f010000-0000-4000-8000-000000000001','Expired pilot smoke','expired-pilot-smoke-code','fa','Expired smoke course',current_date-90,current_date-31,30);
insert into public.learning_class_members(class_id,user_id,display_name,participant_code,consented_at,withdrawn_at)
values('7f020000-0000-4000-8000-000000000002','7f010000-0000-4000-8000-000000000002','Expired identity','P-EXPIRED',now()-interval '60 days',null);
insert into public.learning_events(user_id,product,event_type) values('7f010000-0000-4000-8000-000000000002','cursos','expired_class_event');
insert into public.pilot_assessments(class_id,user_id,period,assessed_at,metrics)
values('7f020000-0000-4000-8000-000000000002','7f010000-0000-4000-8000-000000000002','baseline',now()-interval '45 days','{}');
do $$
begin
  if public.purge_expired_pilot_class_data()<3 then raise exception 'Retention purge did not remove all class-scoped records'; end if;
  if exists(select 1 from public.learning_event_classes where class_id='7f020000-0000-4000-8000-000000000002') then raise exception 'Retention purge kept class-event links'; end if;
  if exists(select 1 from public.pilot_assessments where class_id='7f020000-0000-4000-8000-000000000002') then raise exception 'Retention purge kept assessment snapshots'; end if;
  if exists(select 1 from public.learning_class_members where class_id='7f020000-0000-4000-8000-000000000002') then raise exception 'Retention purge kept participant identity'; end if;
  if not exists(select 1 from public.learning_events where event_type='expired_class_event') then raise exception 'Retention purge deleted learner-owned evidence'; end if;
end $$;

rollback;

select 'pilot-db-smoke-passed' as result;
