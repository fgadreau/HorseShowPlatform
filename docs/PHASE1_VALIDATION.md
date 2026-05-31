# Phase 1 Validation

## Goal

Phase 1 locks down the Supabase foundation before the MVP workflows grow:

- migrations apply cleanly through `0004_phase1_rls_hardening.sql`
- duplicated `organization_id` values stay aligned with their parent records
- RLS isolates associations from each other
- exhibitors can only touch their own linked contact, horse, entry and invoice records
- ShowScore staff roles can see/use only the module surfaces they are assigned to

## Files Added

- `supabase/migrations/0004_phase1_rls_hardening.sql`
  - adds tenant-consistency triggers for show roles, show days, classes, divisions, horses, entries, stalls, invoices and payments
  - adds helper functions for horse entry/stall/payment permissions
  - tightens self-service RLS policies for horses, horse contacts, entries and stall bookings
  - tightens client-side audit event writes

- `supabase/seed.sql`
  - creates deterministic local/staging test users, organizations, shows, contacts, horses, entries, invoices and a ShowScore class setup

- `supabase/tests/phase1_rls.sql`
  - runs RLS assertions inside a transaction and rolls back at the end

## Local Run

Start the local Supabase stack:

```bash
HOME=/tmp npx supabase start
```

Reset the local database and apply migrations/seed:

```bash
HOME=/tmp npx supabase db reset
```

Run the RLS validation script:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/phase1_rls.sql
```

Run the frontend build:

```bash
npm run build
```

If the Supabase CLI tries to write telemetry into a read-only home directory, prefix the command with `HOME=/tmp`.

## Local Prerequisites

If the local terminal reports that it cannot connect to Docker or that `psql` is missing, install/start the local tools first.

On Debian 12:

```bash
sudo apt update
sudo apt install -y docker.io postgresql-client
sudo service docker start
sudo usermod -aG docker "$USER"
```

Then close and reopen the terminal, or run:

```bash
newgrp docker
```

Confirm both tools are available:

```bash
docker info
psql --version
```

If you use Docker Desktop instead of Docker Engine, start Docker Desktop before running Supabase commands.

## Staging Run

Apply migrations to a staging Supabase project:

```bash
npx supabase db push
```

Run the RLS validation script against a staging database URL:

```bash
psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase1_rls.sql
```

Do not run the phase 1 seed or RLS test against production.

## Seed Actors

| Actor | Auth user id | Profile id | Email |
| --- | --- | --- | --- |
| Platform admin | `10000000-0000-0000-0000-000000000001` | `20000000-0000-0000-0000-000000000001` | `phase1.platform@example.test` |
| Org A admin | `10000000-0000-0000-0000-000000000002` | `20000000-0000-0000-0000-000000000002` | `phase1.org-a-admin@example.test` |
| Org A secretary | `10000000-0000-0000-0000-000000000003` | `20000000-0000-0000-0000-000000000003` | `phase1.org-a-secretary@example.test` |
| Org A owner | `10000000-0000-0000-0000-000000000004` | `20000000-0000-0000-0000-000000000004` | `phase1.org-a-owner@example.test` |
| Org A judge | `10000000-0000-0000-0000-000000000005` | `20000000-0000-0000-0000-000000000005` | `phase1.org-a-judge@example.test` |
| Org B admin | `10000000-0000-0000-0000-000000000006` | `20000000-0000-0000-0000-000000000006` | `phase1.org-b-admin@example.test` |

## Expected Checks

The RLS script should print `NOTICE: ok - ...` for each scenario:

- anon cannot see private shows or private ShowScore setup rows
- platform admin can see both organizations and both entries
- Org A admin sees Org A but not Org B
- Org A secretary can see Org A entries and create an Org A invoice
- Org A owner sees only their linked contact, horse, entry and invoices
- Org A owner can create a second draft entry for their own horse
- Org A owner cannot create an entry for an Org B horse
- Org A judge can view the assigned ShowScore setup
- Org A judge cannot update class setup records
- Org A judge can create a scoring session
- Org B admin sees Org B records but not Org A invoices

## Acceptance Criteria

Phase 1 is considered ready when:

- `npx supabase db reset` passes locally
- `supabase/tests/phase1_rls.sql` passes locally or on staging
- `npm run build` passes
- no production secrets are exposed in frontend code
- `docs/SETUP_LOCAL.md` remains environment-specific and is not required for the RLS test
