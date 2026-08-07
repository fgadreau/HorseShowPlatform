-- Restore the SQL privileges required for authenticated application traffic.
-- RLS policies remain the authority for every row-level decision.
-- Impact ShowScore: SS-T (technical access repair, unchanged role behavior).

grant select, insert, update, delete on table
  public.organizations,
  public.organization_members,
  public.shows,
  public.show_days,
  public.organization_disciplines,
  public.slates,
  public.directory_contacts,
  public.directory_horses,
  public.contact_roles,
  public.organization_external_membership_requirements,
  public.organization_membership_types,
  public.contact_organization_memberships,
  public.organization_products,
  public.manual_sales,
  public.contact_external_memberships,
  public.horse_external_memberships,
  public.horse_health_documents,
  public.horse_contacts,
  public.organization_back_numbers,
  public.blocks,
  public.block_judge_assignments,
  public.block_concurrency_groups,
  public.block_concurrency_group_members,
  public.block_templates,
  public.class_templates,
  public.classes,
  public.class_governing_bodies,
  public.class_template_governing_bodies,
  public.entries,
  public.stall_options,
  public.stall_bookings,
  public.invoices,
  public.invoice_line_items,
  public.show_announcements,
  public.scored_runs,
  public.block_run_entries,
  public.block_run_class_entries,
  public.entry_results,
  public.payout_calculations,
  public.payout_awards,
  public.show_score_block_setups,
  public.show_score_scoring_sessions,
  public.show_score_judge_sessions,
  public.show_score_official_results,
  public.show_score_publication_states,
  public.show_score_paid_warmups,
  public.block_result_publications,
  public.entry_import_batches
to authenticated;

grant select on table
  public.disciplines,
  public.external_organizations,
  public.governing_bodies,
  public.nrha_rider_rankings,
  public.payout_schedules,
  public.payout_schedule_brackets
to authenticated;

notify pgrst, 'reload schema';
