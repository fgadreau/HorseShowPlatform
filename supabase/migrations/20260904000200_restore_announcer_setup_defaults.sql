-- Converge chronological installs and PREPROD out-of-order reconciliation.
-- Preserve explicit sources, approvals, runs, timestamps and session revisions.
alter table public.show_score_block_setups
  alter column live_data_source set default 'announcer',
  alter column qualified_rider_count set default 6;

notify pgrst, 'reload schema';
