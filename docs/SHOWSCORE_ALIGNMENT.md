# ShowScore Alignment

## Reviewed Source

ShowScore source reviewed from `https://github.com/fgadreau/reining-app.git`, cloned locally at `/tmp/reining-app`.

Primary references:

- `/tmp/reining-app/docs/v2-data-model.md`
- `/tmp/reining-app/docs/supabase-schema.sql`
- `/tmp/reining-app/src/features/associations/associationRepository.js`
- `/tmp/reining-app/src/features/shows/showRepository.js`
- `/tmp/reining-app/src/features/days/dayRepository.js`
- `/tmp/reining-app/src/features/classes/classRepository.js`
- `/tmp/reining-app/src/features/classes/classSetupRepository.js`
- `/tmp/reining-app/src/features/scoring/scoringRepository.js`
- `/tmp/reining-app/src/features/auth/accessRoles.js`

## Direction

Horse Show Platform should become the canonical system for show administration, entries, people, horses, billing and permissions.

ShowScore should become the scoring/results module inside that platform, not a second independent source of truth for associations, shows, classes or people.

In the UI, the customer-facing word can still be "Association". In the HSP database, the canonical table can remain `organizations`.

## Implementation Status

Migration `supabase/migrations/0003_show_score_alignment.sql` starts this bridge by:

- adding compatibility fields to HSP `organizations`, `shows`, `show_days` and `classes`
- adding nullable legacy ShowScore ids for future imports
- creating the first `show_score_*` module tables with UUID foreign keys back to HSP records
- adding RLS helpers and policies for admin, secretary, judge, scribe and announcer access
- adding triggers that keep duplicated `organization_id` and `show_id` references aligned with their canonical HSP records

Adapter file `src/services/showScoreAdapters.ts` also starts the code bridge by converting canonical HSP records into the current ShowScore client shapes:

- `toShowScoreAssociation`
- `toShowScoreShow`
- `toShowScoreDay`
- `toShowScoreClass`
- `buildShowScoreRunsForClass`

## Source Of Truth

| Domain | Canonical owner | Notes |
| --- | --- | --- |
| Association / organization | HSP `organizations` | ShowScore `associations` should map to this. |
| User profile | HSP `user_profiles` plus Supabase `auth.users` | HSP currently stores a separate profile id and auth user id. ShowScore uses `auth.users.id` directly. This needs an explicit bridge. |
| Association membership | HSP `organization_members` | Roles must expand or map to include scoring roles. |
| Show event | HSP `shows` | ShowScore `shows` should reference the HSP show. |
| Show days | HSP `show_days` | ShowScore `days` maps cleanly to this table. |
| Classes | HSP `classes` | ShowScore classes are scoring classes. HSP should add missing scoring metadata or use an extension table. |
| Divisions | HSP `divisions` | ShowScore does not currently model divisions as first-class records. |
| Contacts / riders / owners / payers | HSP `contacts` | ShowScore runs currently store names as text snapshots. |
| Horses | HSP `horses` | ShowScore runs currently store horse names as text snapshots. |
| Entries | HSP `entries` | ShowScore class setup runs should be generated from HSP entries. |
| Draw / back numbers | HSP entry workflow, then ShowScore setup snapshot | The locked scoring draw should preserve a snapshot for audit/history. |
| Scoring sessions | ShowScore module | Keep as module-owned data linked to HSP classes. |
| Official results | ShowScore module | Results should become immutable once validated. |
| Publication state | ShowScore module | Public/live views should read from explicit publication state. |
| Billing / stalls / payments | HSP | Not present in ShowScore. |

## Entity Mapping

| ShowScore | HSP | Recommended action |
| --- | --- | --- |
| `associations.id` text | `organizations.id` uuid | Prefer HSP UUID as the long-term id. If existing ShowScore records must be preserved, add a legacy mapping column such as `legacy_showscore_association_id`. |
| `associations.name` | `organizations.name` | Direct mapping. |
| `associations.short_name` | missing | Add `short_name` to HSP if needed for public/scoring views. |
| `associations.timezone` | `organizations.timezone` | Direct mapping. |
| `associations.logo_data_url` | `organizations.logo_url` | Prefer file/object URL long term. Data URLs are useful for local/offline mode but less ideal for production. |
| `association_memberships` | `organization_members` / `show_roles` | `admin` and `secretary` map to organization access. `scribe` and `announcer` likely belong in `show_roles`, with optional organization-level defaults later. |
| `shows.association_id` | `shows.organization_id` | Direct relationship after association mapping. |
| `shows.venue` | missing or `shows.location` | Add `venue` if we need venue name separate from city/location. |
| `shows.location` | `shows.location`, `city`, `state`, `country` | HSP is more structured. Import can keep raw location and split later. |
| `shows.status` draft/active/completed/archived | `shows.status` draft/open/closed/archived | Decide whether HSP should adopt `active/completed` or map them to `open/closed`. |
| `days.label` | `show_days.day_name` | Direct mapping. |
| `days.date` | `show_days.day_date` | Direct mapping. |
| `days.sort_order` | `show_days.day_number` or new `sort_order` | Add `sort_order` if display order must differ from day number. |
| `classes.day_id` | `classes.show_day_id` | Direct relationship after day mapping. |
| `classes.class_code` | `classes.code` | Direct mapping. |
| `classes.arena` | `classes.ring_number` or new `arena` | Add `arena` if text names are needed. |
| `classes.pattern` | missing | Add scoring metadata to `classes` or to a `show_score_class_settings` table. |
| `classes.custom_pattern` | missing | Store in scoring module table unless needed before scoring setup. |
| `classes.judge_name` | missing | Better represented by `show_roles` for real users; keep optional display snapshot for PDFs. |
| `classes.sort_order` | missing | Add for schedule/display ordering. |
| `class_setups` | new `show_score_class_setups` | Keep module table, but use `class_id uuid references classes(id)`. |
| `scoring_sessions` | new `show_score_scoring_sessions` | Keep module table, linked to HSP class ids. |
| `judge_scoring_sessions` | new `show_score_judge_sessions` | Keep module table. Future multi-judge support fits here. |
| `official_results` | new `show_score_official_results` | Keep module table. Finalized result rows should be treated as immutable. |
| `publication_states` | new `show_score_publication_states` | Keep module table. Public views should read only published/live-safe fields. |
| `paid_warmups` | new module table or HSP extras workflow | Decide whether paid warmups are a scored module feature or an entry/billing add-on. |
| `app_events` | HSP `audit_events` plus analytics events | Audit-critical events should land in HSP audit. Product analytics can stay separate. |

## Important Mismatches

### 1. Id Type

ShowScore uses `text` primary keys for associations, shows, days and classes. New records often use `crypto.randomUUID()`, but local seed records can be values like `aqr` or `e2e-robot-class`.

HSP uses UUID primary keys.

Recommended path:

1. Keep HSP UUID ids as canonical.
2. Add temporary legacy mapping columns only if existing ShowScore production data must be imported.
3. Teach the ShowScore module adapter to read and write HSP UUIDs.

### 2. User Identity

ShowScore access rows reference Supabase `auth.users.id`.

HSP access rows reference `public.user_profiles.id`, while `user_profiles.user_id` references `auth.users.id`.

Recommended path:

1. Treat `auth.users.id` as the login identity.
2. Treat `user_profiles.id` as the HSP domain profile id.
3. Add helper queries or views so module code can reliably resolve `auth_user_id <-> user_profile_id`.

### 3. Roles

ShowScore roles:

- `admin`
- `secretary`
- `scribe`
- `announcer`

HSP organization roles:

- `admin`
- `secretary`
- `user`

HSP show roles already include:

- `organizer`
- `secretary`
- `judge`
- `scribe`
- `announcer`

Recommended path:

- Keep `admin` and `secretary` as organization-level roles.
- Use `show_roles` for `judge`, `scribe` and `announcer`.
- Add permissions later instead of multiplying role names too early.

### 4. Entries Versus Scoring Runs

ShowScore `class_setups.runs` currently stores display fields such as rider, horse and owner as text.

HSP entries are normalized and reference horse, rider, owner, payer and division records.

Recommended run payload:

```json
{
  "id": "run-or-entry-id",
  "entryId": "uuid",
  "classId": "uuid",
  "divisionId": "uuid",
  "horseId": "uuid",
  "riderContactId": "uuid",
  "ownerContactId": "uuid",
  "payerContactId": "uuid",
  "draw": 1,
  "backNumber": "123",
  "rider": "Display rider name snapshot",
  "horse": "Display horse name snapshot",
  "owner": "Display owner name snapshot"
}
```

The ids keep the data alignable. The display snapshots protect scoring history if a name is corrected later.

## Recommended Target Architecture

Use one Supabase project and one canonical HSP schema.

Suggested table direction:

- Keep existing HSP tables for core records.
- Add missing core fields with small migrations when needed.
- Add ShowScore module tables with a clear prefix, for example:
  - `show_score_class_setups`
  - `show_score_scoring_sessions`
  - `show_score_judge_sessions`
  - `show_score_official_results`
  - `show_score_publication_states`
  - `show_score_paid_warmups`

Avoid importing ShowScore base tables named `associations`, `shows`, `days` and `classes` into HSP as-is, because HSP already owns those concepts.

## Phased Plan

### Phase 1: Vocabulary And Fields

- Keep user-facing label "Association".
- Keep DB table `organizations`.
- Add any missing low-risk fields HSP needs for ShowScore compatibility:
  - `organizations.short_name`
  - `shows.venue`
  - `show_days.sort_order`
  - `classes.arena`
  - `classes.pattern`
  - `classes.custom_pattern`
  - `classes.judge_name`
  - `classes.sort_order`

Some of these may move to a scoring settings table instead of core tables if we want stricter separation.

### Phase 2: Module Tables

Create ShowScore module tables in HSP with UUID foreign keys to:

- `organizations.id`
- `shows.id`
- `show_days.id`
- `classes.id`
- `entries.id`
- `contacts.id`
- `horses.id`

### Phase 3: Adapter Layer

Add adapter functions in the ShowScore module so the existing UI can keep its camelCase shape while reading HSP-backed data:

- `toShowScoreAssociation(organization)`
- `toShowScoreShow(show)`
- `toShowScoreDay(showDay)`
- `toShowScoreClass(classRecord)`
- `toShowScoreRun(entry, relatedRecords)`

This avoids rewriting every ShowScore screen at once.

### Phase 4: Generate Draws From HSP Entries

Use HSP entries as the source for class setup runs.

Admin/secretary workflow:

1. Entries are created in HSP by competitors or support staff.
2. Secretary reviews entries.
3. Draw/back numbers are assigned.
4. ShowScore class setup receives a locked snapshot for scoring.
5. Scoring, official results and publication happen in the ShowScore module.

### Phase 5: Preserve Existing ShowScore Data

If existing ShowScore production data must be migrated:

- Create legacy id columns or an import mapping table.
- Import associations first, then shows, days, classes, setups and results.
- Preserve JSONB run snapshots exactly for official historical records.
- Attach HSP ids only when a confident match exists.

## Decisions To Make Next

1. Should HSP add a visible `short_name` for associations?
2. Should show status use `open/closed` or `active/completed`?
3. Should `scribe` and `announcer` be assignable at association level, show level, or both?
4. Should `pattern`, `judge_name` and `arena` live on HSP `classes`, or only in a ShowScore settings table?
5. Are there existing ShowScore records that must be migrated, or can ShowScore start fresh on HSP ids?

## Near-Term Recommendation

Before moving code between apps, create the HSP schema bridge first:

1. Decide the role/status vocabulary.
2. Add the missing HSP fields or module settings table.
3. Add ShowScore-prefixed module tables using HSP UUID foreign keys.
4. Build a small adapter layer that lets ShowScore screens consume HSP records.

That keeps the integration incremental and avoids a second database model growing beside HSP.
