-- Allow ShowScore association-level scribes to write live scoring sessions.
--
-- The original ShowScore compatibility policy allowed show-level scribe/judge
-- roles, but ShowScore's app menu and access model also grant scoring access
-- from organization_members.role = 'scribe'. Without this, the scribe UI can
-- open the scoring page but Supabase rejects the scoring session upsert.

create or replace function public.can_score_show_score_class(
  target_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.classes c
    where c.id = target_class_id
      and (
        public.is_platform_admin()
        or public.is_org_member(
          c.organization_id,
          array['admin', 'secretary', 'scribe']
        )
        or public.has_show_role(
          c.show_id,
          array['organizer', 'secretary', 'judge', 'scribe']
        )
      )
  )
$$;

drop policy if exists "ShowScore scorers can manage scoring sessions"
  on public.show_score_scoring_sessions;

create policy "ShowScore scorers can manage scoring sessions"
  on public.show_score_scoring_sessions for all
  to authenticated
  using (public.can_score_show_score_class(class_id))
  with check (public.can_score_show_score_class(class_id));

drop policy if exists "ShowScore scorers can manage judge sessions"
  on public.show_score_judge_sessions;

create policy "ShowScore scorers can manage judge sessions"
  on public.show_score_judge_sessions for all
  to authenticated
  using (public.can_score_show_score_class(class_id))
  with check (public.can_score_show_score_class(class_id));

notify pgrst, 'reload schema';
