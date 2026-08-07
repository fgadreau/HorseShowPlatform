# ShowScore public Broadcast

## Objective

Public ShowScore TV, OBS, livestream and result views use one private Supabase
Broadcast topic per show:

```text
showscore-public:<show-id>
```

This replaces the normal-case fan-out of filtered Postgres Changes
subscriptions. The existing Postgres Changes publication remains intact and the
client activates it automatically if the private Broadcast subscription fails.
The progressive REST refresh loop remains the final convergence mechanism.

## Security boundary

Realtime RLS authorizes the show topic through
`showscore_can_receive_public_broadcast(text)`. A show topic cannot express
block-level visibility, so the central trigger function is the mandatory second
gate:

- live scoring and judge rows require `showscore_public_live_class_exists`;
- setup and announcer rows require `showscore_public_class_exists`;
- publication and official-result rows keep the same visibility contract as
  the public REST policies;
- hidden block rows are never sent;
- visibility changes send only `public_show_snapshot / INVALIDATE`, never row
  data.

Every browser channel must use `config: { private: true }`. The trigger and row
projector functions have no `EXECUTE` grant for `public`, `anon` or
`authenticated`, and those roles have no Broadcast sequence privilege or
Realtime message `INSERT` policy.

The client additionally ignores row events whose `block_id` was absent from its
last public REST snapshot. This is display-side defense in depth; the database
trigger remains the confidentiality boundary.

## Ordering and payloads

Each emitted change receives:

- `event_id = <table>:<row_key>:<event_seq>`;
- a global, lock-free PostgreSQL sequence `event_seq`;
- an explicit `row_key`;
- `show_id` and, where applicable, `block_id`.

Clients compare `event_seq` for the same `(table, row_key)` and ignore duplicate
or older deliveries. Concurrent writes to the same database row are already
serialized by PostgreSQL's row lock; the global sequence does not add a shared
row lock.

Rows are projected to public fields instead of sending the SQL record. The
serialized envelope is capped at 512 KiB. A larger change becomes an explicit
REST invalidation. The local 167-run fixture currently serializes to about
35 KiB.

## Validation

Database contract:

```bash
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 \
  --file supabase/tests/showscore_public_broadcast.sql
```

End-to-end private channel:

```bash
SUPABASE_URL=... \
SUPABASE_PUBLISHABLE_KEY=... \
SUPABASE_SERVICE_ROLE_KEY=... \
BROADCAST_PUBLIC_SHOW_ID=... \
BROADCAST_PRIVATE_SHOW_ID=... \
BROADCAST_PUBLIC_BLOCK_ID=... \
npm run test:broadcast
```

Before promotion, repeat the controlled capacity test and compare:

- source-write p95 before and after the triggers;
- Broadcast delivery p95 and p99;
- connected displays and unrecovered reconnects;
- REST request volume during steady state;
- convergence after offline/online and public/private transitions.

## Deployment order

1. Apply the additive HSP migration to PREPROD.
2. Run the SQL and private-channel tests.
3. Deploy the ShowScore PREPROD client. It will fall back to Postgres Changes if
   Broadcast is unavailable.
4. Run smoke, 167-run and controlled 500-view tests.
5. Promote the database migration before the production ShowScore client.

Do not remove the source tables from `supabase_realtime` during the initial
rollout. They are required for automatic fallback and safe rollback.

## Emergency rollback

If source-write latency or Broadcast behavior is unhealthy during a live show,
disable the Broadcast triggers **before** rolling back the client:

```sql
alter table public.shows disable trigger showscore_public_broadcast_shows;
alter table public.blocks disable trigger showscore_public_broadcast_blocks_visibility;
alter table public.blocks disable trigger showscore_public_broadcast_blocks_delete;
alter table public.show_score_paid_warmups disable trigger showscore_public_broadcast_show_score_paid_warmups;
alter table public.show_score_scoring_sessions disable trigger showscore_public_broadcast_show_score_scoring_sessions;
alter table public.show_score_judge_sessions disable trigger showscore_public_broadcast_show_score_judge_sessions;
alter table public.show_score_block_setups disable trigger showscore_public_broadcast_show_score_block_setups;
alter table public.show_score_publication_states disable trigger showscore_public_broadcast_show_score_publication_states;
alter table public.show_score_official_results disable trigger showscore_public_broadcast_show_score_official_results;
alter table public.show_score_announcer_live_sessions disable trigger showscore_public_broadcast_show_score_announcer_live_sessions;
```

Then restore the previous ShowScore Vercel deployment. That client will use the
unchanged Postgres Changes publication. Re-enable the triggers only after the
incident is understood and PREPROD validation is green.
