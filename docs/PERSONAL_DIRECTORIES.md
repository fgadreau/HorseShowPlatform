# Personal directory selection

After signing in, a participant can choose an association from the header in
**My space**. Under **My profile → My directories**, choosing a directory links
the participant's own contact. Several directories and associations can be
selected. This does not purchase a membership card or grant organization staff
permissions.

When adding a horse under **My horses**, choose one or more directories before
completing the horse form. The service checks that all selected directories are
active, accessible and belong to the current association before writing. The
association's default remains the initial selection, but it can be replaced.
Switching associations closes/reset the horse creation form to avoid submitting
stale directory selections to another association.

## Database rollout

Apply these migrations to the verified PREPROD database before deploying the
frontend:

- `20261025000600_public_show_directory_discovery.sql`
- `20261025000700_self_directory_enrollment.sql`
- `20261025000800_horse_creator_insert_returning.sql`

Discovery is limited to active directories of associations with public shows;
existing staff access remains in place. `join_public_directory` requires an
authenticated user with a profile, validates the target directory, reuses the
user's own contact and adds an idempotent directory link in one transaction.
Profile locking serializes simultaneous enrollments by the same account. The
RPC accepts no user/contact parameter and creates no staff or paid membership.

An association without a public show still requires its normal staff-assisted
onboarding. An inactive or absent directory must be configured by its staff.

After rollout, use a new participant account to select an association, join two
directories, reload, and verify the choices persist. Then create a disposable
horse in a nondefault directory and verify its owner and horse directory links.
These post-deployment checks require the migrations to be installed; the test
account alone cannot install database migrations.

## Regression checks

From the repository root:

```sh
npm run build
node scripts/tests/directory-ui/run.mjs
npm install --prefix .tmp/db-tools --package-lock=false @electric-sql/pglite@0.3.14
node scripts/test-directory-enrollment.mjs
node scripts/test-horse-insert-returning.mjs
```

The browser test uses the real React components and horse creation service with
mocked network/database boundaries at a mobile viewport. It uses system Chromium
at `/usr/bin/chromium` (override with `CHROMIUM_EXECUTABLE_PATH`), or Playwright's
installed Chromium if that system path is absent. The database test runs the
actual migration functions/policy in isolated PostgreSQL with minimal fixtures
and auth helper stubs. It checks idempotency, own-contact isolation, authentication
and inaccessible/inactive targets. It does not replace full Supabase migration
or trigger integration tests.

The horse regression test reproduces the original `INSERT ... RETURNING` RLS
failure before applying migration 008, then checks the creator can receive the
inserted row while unrelated horses and unauthorized inserts remain blocked.
