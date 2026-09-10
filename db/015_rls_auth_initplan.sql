-- Evaluate the authenticated user once per statement instead of once per row.
-- This preserves every existing ownership boundary while clearing the hosted
-- database advisor's auth_rls_initplan findings.
begin;

alter policy "own snapshot select" on public.study_snapshots
  using ((select auth.uid()) = user_id);
alter policy "own snapshot insert" on public.study_snapshots
  with check ((select auth.uid()) = user_id);
alter policy "own snapshot update" on public.study_snapshots
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "own reviews select" on public.review_events
  using ((select auth.uid()) = user_id);
alter policy "own reviews insert" on public.review_events
  with check ((select auth.uid()) = user_id);

alter policy "own profile select" on public.profiles
  using ((select auth.uid()) = id);
alter policy "own profile insert" on public.profiles
  with check ((select auth.uid()) = id);
alter policy "own profile update" on public.profiles
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

alter policy "own vocabulary select" on public.platform_vocabulary
  using ((select auth.uid()) = user_id);
alter policy "own vocabulary insert" on public.platform_vocabulary
  with check ((select auth.uid()) = user_id);
alter policy "own vocabulary update" on public.platform_vocabulary
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "own vocabulary delete" on public.platform_vocabulary
  using ((select auth.uid()) = user_id);

alter policy "Own notebook only" on public.learning_notes
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter policy "Class owners" on public.learning_classes
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
alter policy "Member or class owner reads membership" on public.learning_class_members
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.learning_classes c
      where c.id = class_id and c.owner_id = (select auth.uid())
    )
  );

alter policy "own learning events select" on public.learning_events
  using ((select auth.uid()) = user_id);
alter policy "own learning events insert" on public.learning_events
  with check ((select auth.uid()) = user_id);
alter policy "own learning events delete" on public.learning_events
  using ((select auth.uid()) = user_id);
alter policy "own learning event class links select" on public.learning_event_classes
  using ((select auth.uid()) = user_id);
alter policy "learner reads own pilot assessments" on public.pilot_assessments
  using ((select auth.uid()) = user_id);
alter policy "own generation quality select" on public.generation_quality_runs
  using ((select auth.uid()) = user_id);
alter policy "own generation quality insert" on public.generation_quality_runs
  with check ((select auth.uid()) = user_id);

commit;
