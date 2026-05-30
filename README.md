# Horse Show Platform

MVP starter for a multi-tenant horse show management platform.

## Stack

- React + TypeScript + Vite
- Supabase Auth, PostgreSQL, RLS and Storage
- Stripe and Resend through Supabase Edge Functions in later phases
- Vercel for frontend deployment

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a local env file:

   ```bash
   cp .env.example .env.local
   ```

3. Fill the frontend-safe Supabase values:

   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
   ```

4. Apply the Supabase migration:

   ```bash
   supabase db push
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

## Current MVP Foundation

- Auth screen using Supabase email/password
- Automatic `user_profiles` bootstrap for authenticated users
- Organization creation with first admin membership
- Show creation and listing
- Billing overview wired to invoice records
- Initial Supabase schema with RLS helpers and policies
- Storage buckets for logos, show documents, horse documents, invoices and health documents

## Important Security Notes

- `VITE_SUPABASE_PUBLISHABLE_KEY` is safe for browser use when RLS is correct. Legacy projects can still use `VITE_SUPABASE_ANON_KEY`.
- `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `RESEND_API_KEY` must never be used in frontend code.
- Stripe, invoice finalization, email sending and sensitive payment updates should be implemented as Supabase Edge Functions.

## Next Build Steps

1. Create the Supabase project and run `supabase/migrations/0001_initial_schema.sql`.
2. Confirm RLS behavior with test users for platform admin, organization admin, secretary and exhibitor.
3. Add contacts, horses, entries and invoice creation workflows.
4. Add Edge Functions for Stripe checkout/webhook and Resend email.
5. Connect Vercel environment variables and deploy the frontend.

Deployment notes live in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
