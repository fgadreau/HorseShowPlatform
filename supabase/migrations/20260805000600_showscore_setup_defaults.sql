-- New ShowScore block setups start with the operating defaults used at shows.
-- Existing explicit choices remain unchanged.
alter table public.show_score_block_setups
  alter column live_data_source set default 'announcer',
  alter column qualified_rider_count set default 6;
