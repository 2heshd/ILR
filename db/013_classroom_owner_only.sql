begin;
-- Immutable verified identity; profiles and user metadata are user-editable.
create or replace function public.learning_can_manage_classes() returns boolean
language sql stable set search_path='' as $$
  select coalesce(auth.uid()='eef89588-eab7-4543-9dad-e1b8a209553f'::uuid,false);
$$;
revoke all on function public.learning_can_manage_classes() from public,anon;
grant execute on function public.learning_can_manage_classes() to authenticated;

-- Restrictive policies AND with the existing owner policy, including direct API calls.
create policy "Only designated teacher manages classes" on public.learning_classes
as restrictive for all to authenticated
using(public.learning_can_manage_classes())
with check(public.learning_can_manage_classes());

-- Security-definer reports must also explicitly check the designated teacher.
do $$
declare signature text; definition text;
  old_guard text := 'if not exists(select 1 from public.learning_classes where id=target and owner_id=auth.uid()) then';
begin
  foreach signature in array array['public.learning_class_report(uuid)','public.learning_class_comprehension_report(uuid)'] loop
    definition:=pg_get_functiondef(signature::regprocedure);
    if position(old_guard in definition)=0 then raise exception 'Expected report guard missing: %',signature; end if;
    execute replace(definition,old_guard,'if not public.learning_can_manage_classes() or not exists(select 1 from public.learning_classes where id=target and owner_id=auth.uid()) then');
  end loop;
end $$;
commit;
