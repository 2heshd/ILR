-- Distinguish full-report replays from sentence-level gist playback.
begin;
create or replace function public.learning_comprehension_evidence(snapshot jsonb) returns jsonb
language plpgsql stable set search_path=public as $$
declare result jsonb:='[]'; mode text; attempts jsonb; sources jsonb; a jsonb; source_item jsonb; question_types jsonb; filtered_types jsonb; q jsonb; point jsonb; points jsonb; stamp timestamptz; score numeric; idx numeric; n numeric; seen integer[]; grading text; count_rows integer:=0;
begin
  foreach mode in array array['reading','listening'] loop
    attempts:=snapshot->case when mode='reading' then 'passageAttempts' else 'listeningAttempts' end;
    sources:=snapshot->case when mode='reading' then 'passages' else 'listeningItems' end;
    if jsonb_typeof(attempts) is distinct from 'array' then continue; end if;
    if jsonb_typeof(sources) is distinct from 'array' then sources:='[]'; end if;
    for a in select value from jsonb_array_elements(attempts) loop
      begin stamp:=(a->>'attemptedAt')::timestamptz; exception when others then continue; end;
      if stamp is null or stamp<(((now() at time zone 'UTC')::date-6)::timestamp at time zone 'UTC') or stamp>now() then continue; end if;
      if count_rows>=1000 then exit; end if;
      count_rows:=count_rows+1;
      grading:=case when a->>'gradingMode' in ('ai','self') then a->>'gradingMode' else 'unknown' end;
      score:=public.learning_report_number(a->'comprehensionScore');
      if score<0 or score>100 then score:=null; end if;
      source_item:=null;
      select value into source_item from jsonb_array_elements(sources) where value->>'id'=a->>case when mode='reading' then 'passageId' else 'listeningItemId' end limit 1;
      points:='[]';seen:='{}';
      question_types:=a->'questionTypes';
      if jsonb_typeof(question_types) is distinct from 'array' then
        question_types:='[]';
        if jsonb_typeof(source_item->'questions')='array' then
          select coalesce(jsonb_agg(value->'type' order by ord),'[]') into question_types from jsonb_array_elements(source_item->'questions') with ordinality as x(value,ord);
          if (mode='reading' and a->>'readingMode'='inference') or (mode='listening' and a->>'listeningMode'='gist') then
            select coalesce(jsonb_agg(value order by ord),'[]') into filtered_types from jsonb_array_elements(question_types) with ordinality as x(value,ord) where value<>'"detail"'::jsonb;
            if jsonb_array_length(filtered_types)>0 then question_types:=filtered_types; end if;
          end if;
        end if;
      end if;
      if grading='ai' and jsonb_typeof(a->'grade'->'answers')='array' then
        for point in select value from jsonb_array_elements(a->'grade'->'answers') loop
          idx:=public.learning_report_number(point->'questionIndex'); n:=public.learning_report_number(point->'score');
          if idx is null or idx<0 or idx>999 or idx<>trunc(idx) or idx::integer=any(seen) or n is null or n<0 or n>100 then continue; end if;
          q:=question_types->(idx::integer);
          if q#>>'{}' in ('detail','inference','discourse','main_idea') then
            points:=points||jsonb_build_array(jsonb_build_object('type',q#>>'{}','score',n)); seen:=array_append(seen,idx::integer);
          end if;
        end loop;
      end if;
      result:=result||jsonb_build_array(jsonb_build_object(
        'id',mode||'-'||count_rows,'modality',mode,'attempted_at',to_char(stamp at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'score',score,'grading_mode',grading,'questions',points,
        'practice_mode',case when mode='reading' and a->>'readingMode' in ('full','inference') then a->>'readingMode' when mode='listening' and a->>'listeningMode' in ('full','gist','rapid') then a->>'listeningMode' else 'unknown' end,
        'listens',case when mode='listening' and public.learning_report_number(a->'listensCount')>=0 then public.learning_report_number(a->'listensCount') else null end,
        'transcript',case when mode='listening' and jsonb_typeof(a->'transcriptRevealed')='boolean' then a->'transcriptRevealed' else null end,
        'rereads',case when mode='reading' and public.learning_report_number(a->'rereads')>=0 then public.learning_report_number(a->'rereads') else null end,
        'duration_ms',case when mode='reading' and public.learning_report_number(a->'durationMs')>=0 then public.learning_report_number(a->'durationMs') else null end
      ));
    end loop;
  end loop;
  return result;
end $$;
revoke all on function public.learning_comprehension_evidence(jsonb) from public,anon,authenticated;

commit;
