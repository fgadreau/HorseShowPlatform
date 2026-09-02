# Stripe Sandbox integration

## Security boundary

- Card number and CVC are collected only by Stripe Elements.
- HSP stores opaque `cus_`, `pm_`, `pi_`, and `ch_` references plus non-sensitive display data returned at runtime.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and `SUPABASE_SERVICE_ROLE_KEY` are Edge Function secrets only.
- Wallet access requires an authenticated account directly linked to the payer contact.
- Invoice payment requires the authenticated account to be the invoice payer.
- Capture requires an association `admin` or `secretary` membership and writes an audit event.

## Server functions

| Function | JWT | Purpose |
| --- | --- | --- |
| `stripe-wallet` | required | Create customer, list/add/remove saved cards |
| `stripe-invoice-payment` | required | Create immediate payment or manual-capture authorization |
| `stripe-capture-payment` | required | Capture all or part of an authorized payment |
| `stripe-webhook` | Stripe signature | Synchronize payment and invoice state idempotently |
| `stripe-connect` | required | Create an Express test account and issue onboarding/dashboard links |

## Supported test lifecycle

1. Add a Sandbox card through Stripe Payment Element.
2. An association manager completes Stripe Connect test onboarding.
3. Create a destination-charge PaymentIntent for an invoice balance.
4. Confirm it in the browser, including test 3DS when required.
5. Receive a signed webhook and mark the payment completed or failed.
6. Recalculate `invoices.total_paid`, `balance_due`, and status.

For preauthorization, create the invoice payment with `captureMethod: "manual"`. Stripe emits `payment_intent.amount_capturable_updated`; HSP records it as processing. Authorized funds can then be captured through `stripe-capture-payment`. A partial capture releases the remainder according to Stripe rules.

## Remaining account configuration

1. Create a Stripe Sandbox and obtain `pk_test_...` and `sk_test_...`.
2. Apply Supabase migrations.
3. Deploy all five functions and set `APP_URL` to the Sandbox frontend origin.
4. Create the webhook endpoint, include `account.updated`, and store its `whsec_...` signing secret.
5. Put `VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...` in the staging frontend environment.
6. Exercise success, decline, 3DS, manual capture, expiry, cancellation, and webhook retry cases before live mode.
