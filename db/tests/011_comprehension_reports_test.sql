-- Transaction rolls back every temporary class/membership. No learner data is output.
begin;
do $$
declare evidence jsonb; payload jsonb; teacher uuid; fixture_class uuid; report jsonb; denied boolean:=false;
begin
 payload:=jsonb_build_object('passages',jsonb_build_array(jsonb_build_object('id','fixture','textFa','PRIVATE PASSAGE','questions',jsonb_build_array(jsonb_build_object('type','detail'),jsonb_build_object('type','inference'),jsonb_build_object('type','main_idea')))),
 'passageAttempts',jsonb_build_array(jsonb_build_object('id','private-id','passageId','fixture','attemptedAt',now(),'gradingMode','ai','readingMode','inference','comprehensionScore',0,'answers',jsonb_build_array('PRIVATE ANSWER'),'grade',jsonb_build_object('answers',jsonb_build_array(jsonb_build_object('questionIndex',0,'score',80),jsonb_build_object('questionIndex',1,'score',60),jsonb_build_object('questionIndex',1,'score',100))))));
 evidence:=public.learning_comprehension_evidence(payload);
 if jsonb_array_length(evidence)<>1 or evidence->0->>'score'<>'0' then raise exception 'Zero/missing regression'; end if;
 if evidence->0->'questions'->0->>'type'<>'inference' or evidence->0->'questions'->1->>'type'<>'main_idea' or jsonb_array_length(evidence->0->'questions')<>2 then raise exception 'Filtered question alignment or dedupe failed'; end if;
 if evidence::text like '%PRIVATE%' or evidence::text like '%private-id%' then raise exception 'Private content exposed'; end if;
 payload:=jsonb_set(payload,'{passageAttempts,0,questionTypes}','["discourse"]');
 evidence:=public.learning_comprehension_evidence(payload);
 if evidence->0->'questions'->0->>'type'<>'discourse' then raise exception 'Explicit question map failed'; end if;
 payload:=jsonb_set(payload,'{passageAttempts,0,gradingMode}','"self"');
 if public.learning_comprehension_evidence(payload)->0->'questions'<>'[]'::jsonb then raise exception 'Self score fabricated category evidence'; end if;
 payload:=jsonb_set(payload,'{passageAttempts,0,attemptedAt}',to_jsonb((now()-interval '8 days')::text));
 if public.learning_comprehension_evidence(payload)<>'[]'::jsonb then raise exception 'Date window failed'; end if;
 if public.learning_comprehension_evidence('{"passageAttempts":[{"attemptedAt":"invalid"}],"listeningAttempts":{}}')<>'[]'::jsonb then raise exception 'Malformed legacy data failed'; end if;
 if has_function_privilege('anon','public.learning_class_comprehension_report(uuid)','EXECUTE') or has_function_privilege('authenticated','public.learning_comprehension_evidence(jsonb)','EXECUTE') then raise exception 'Unexpected public/helper access'; end if;
 select id into teacher from auth.users limit 1;
 if teacher is null then raise exception 'No account for owner-access smoke test'; end if;
 insert into public.learning_classes(owner_id,name) values(teacher,'Rollback-only comprehension smoke test') returning id into fixture_class;
 insert into public.learning_class_members(class_id,user_id,display_name) values(fixture_class,teacher,'Rollback fixture');
 perform set_config('request.jwt.claim.sub',teacher::text,true);
 report:=public.learning_class_comprehension_report(fixture_class);
 if report->0->>'comprehension_shared'<>'false' or report->0->'comprehension'<>'[]'::jsonb then raise exception 'Default sharing must be off'; end if;
 perform public.learning_set_comprehension_sharing(fixture_class,true);
 if not exists(select 1 from public.learning_class_members m where m.class_id=fixture_class and m.user_id=teacher and m.share_comprehension) then raise exception 'Member opt-in failed'; end if;
 perform public.learning_set_comprehension_sharing(fixture_class,false);
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin perform public.learning_class_comprehension_report(fixture_class); exception when others then denied:=true; end;
 if not denied then raise exception 'Non-owner report access was not rejected'; end if;
end $$;
rollback;
