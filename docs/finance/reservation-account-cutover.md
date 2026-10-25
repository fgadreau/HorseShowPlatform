# Reservation account cutover — implementation in progress

Reservation debt policy: only a **different closed account with a positive balance** in the same association blocks a new reservation. Event and non-event accounts participate. Open accounts, zero/credit balances, and historical invoices do not block. The database enforces the rule for all payers; the UI preview exposes only readable accounts.

The adapter is opt-in per show through `configure_reservation_billing`. Configuration requires authorized administration, enabled association capabilities, an explicit billing config and explicit tax rules. No migration automatically enables an association or imports old invoices. Old invoice amounts and payments are preserved. The `product_id` field on historical stall options is preserved; internal billing products are generated independently for reservations.

New reservations in an adopted scope use payer folios. Quantity edits and unpaid cancellations create immutable reversal pairs. Paid lines and pending Stripe operations cannot be silently refunded or changed. A batch inserts all requested lines atomically under the caller's RLS, so a failure rolls back stock and account writes together. Historical booking rows with legacy invoice lines require reconciliation rather than automatic double billing.

## Release gates — do not activate yet

- The existing entry/registration and manual-sale writers still target historical invoices. An event context causes the existing engine guard to reject those writers. Adapt and test these writers before adopting the pilot show, so reservation work does not interrupt entries or other charges.
- Validate split tack and hay amounts with server-authoritative batch quotes, including retries, changes, and concurrent requests. The initial adapter retains the existing split-line representation and its caller-supplied split amount.
- Exercise complete authenticated browser flows against the new schema, including personal account visibility, account payment/closing, and financial-document rendering of reservation adjustments.
- Review historical balances separately. Never mark an old invoice paid or silently copy its balance into a new folio. Determine an explicit reconciliation path before moving historical bookings.

## Verification completed

- `npm run build`.
- `npm run test:reservations:browser`: actual mobile reservation form, independent bedding quantities, obsolete invoice does not block, closed account debt does block.
- `supabase/tests/reservation_billing_accounts.sql`: executed against PREPROD under a rolled-back transaction containing the candidate migration. Covers authenticated RLS writes, full-show dates, quantities and tax rounding, replacement credits, cancellation/stock restoration, atomic failure, non-event open versus closed debt, a paid closed account, protection of paid booking charges, private-writer privileges, and unchanged historical invoices. No test bookings, payments, approvals or capabilities persist.

The SQL test accepts disposable fixture IDs as psql variables (`org_id`, `show_id`, `option_id`, `staff_uid`). The fixture option is horse-free shavings at 9.50; staff must be an association and platform administrator, with a linked contact. The test itself ends in `ROLLBACK`. Do not use it outside an explicitly authorized test environment.
