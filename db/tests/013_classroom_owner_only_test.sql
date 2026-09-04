-- Entire test rolls back, including the fixture class.
begin;
select set_config('request.jwt.claim.sub','eef89588-eab7-4543-9dad-e1b8a209553f',true);
set local role authenticated;
do $$ declare target uuid; begin
 if not public.learning_can_manage_classes() then raise exception 'Owner denied'; end if;
 insert into public.learning_classes(name) values('Rollback-only owner access test') returning id into target;
 perform set_config('test.class_id',target::text,true);
 perform public.learning_class_report(target);
 perform public.learning_class_comprehension_report(target);
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000013',true);
do $$ begin
 if public.learning_can_manage_classes() then raise exception 'Non-owner permitted'; end if;
 if exists(select 1 from public.learning_classes) then raise exception 'Non-owner can read classes'; end if;
 begin
  insert into public.learning_classes(name) values('Must not be created');
  raise exception 'Non-owner insert allowed';
 exception when insufficient_privilege then null; end;
 begin
  perform public.learning_class_report(current_setting('test.class_id')::uuid);
  raise exception 'Basic report leaked';
 exception when raise_exception then if sqlerrm<>'Class owner access required' then raise; end if; end;
 begin
  perform public.learning_class_comprehension_report(current_setting('test.class_id')::uuid);
  raise exception 'Comprehension report leaked';
 exception when raise_exception then if sqlerrm<>'Class owner access required' then raise; end if; end;
end $$;
rollback;
select 'Owner creation and reports work; non-owner creation, reads and reports blocked; all fixtures rolled back' as result;
