# Local Setup Notes

## Environment Variables

Frontend:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_ANON_KEY=
```

Server-only:

```bash
SUPABASE_SERVICE_ROLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
```

Keep server-only secrets in Supabase or Vercel secret storage. Do not prefix them with `VITE_`.

## Supabase

The first database migration lives at:

```bash
supabase/migrations/0001_initial_schema.sql
```

It creates:

- Core auth profile tables
- Organizations and memberships
- Shows, show roles, show days, classes and divisions
- Contacts, horses and horse-contact permissions
- Entries, stall options and stall bookings
- Invoices, line items, payments and audit events
- Initial RLS helpers and policies
- Storage buckets for MVP document needs

## First Admin Flow

The app lets a signed-in user create an organization, then inserts an `organization_members` row with `role = 'admin'`.

For platform-wide admins, insert into `platform_admins` with a service-role connection:

```sql
insert into public.platform_admins (user_id)
select id from public.user_profiles where user_id = '<auth-user-uuid>';
```

## Git

The repository is initialized on the `main` branch. Some sandboxed tool calls may still see `.git` as read-only; normal terminal Git commands should work from the project directory.
