# Reservation and entry account cutover

## Behavior

Only a **different closed account with a positive balance** in the same association blocks a reservation. Event and non-event accounts participate. Open accounts, zero/credit balances and historical invoices do not block. The database checks every payer; the UI preview exposes only accounts the caller may read. A server refusal stays visible beside the submit button.

Show adoption connects reservations, entries, late-entry surcharges, block judge fees and staff sales to payer folios. Judge fees retain the previous highest-entry-fee selection and are charged once per payer/horse/rider/block. Entry prices and late surcharges are computed on the server; a status-only change preserves the quote. Document presentation freezes entry, horse, rider, block, class and back-number references.

Reservation batches insert all lines atomically under caller RLS. Server quotes derive split amounts from option prices, distributing remainder cents deterministically; direct forged split lines are rejected. The inventory row counts stock once, while payer shares create charges without consuming inventory again. Quote admissions are private, bound to actor and transaction, and removed by a deferred trigger at commit.

Unpaid changes and cancellations create immutable reversal pairs. Original charges, tax snapshots, payments and issued documents are never overwritten. Paid lines and pending Stripe operations require an explicit association adjustment/refund before changes. Reversed lines cannot receive allocations. Both account lists and the Stripe allocator consume active charges only; adjustment history remains available in the account.

## Explicit setup

The schema migrations activate no association and import no old balances. Enable the association's engine/personal capabilities, then call `configure_reservation_billing(show, config, taxes)` for a fresh operational show. Existing entries, bookings or sales require reconciliation first. The selected tax rules and numbering prefixes must be explicit. Product mappings for reservation options are internal, so the obsolete “Linked product” selector is removed without clearing historical mappings. Existing configured product tax flags and prices seed the modern staff-sale catalog.

`configure_non_event_billing(org, year, config, taxes)` creates a separate service context for future non-event sales through the modern billing APIs. Membership purchases retain their dedicated contexts and adapter. No old invoice is paid, deleted or silently copied. Historical invoices remain in the read-only archive. The two setup commands preserve existing adopted contexts rather than repricing them.

## Validation

- `npm run build`.
- `npm run test:reservations:browser`: actual mobile form, per-horse bedding quantities, obsolete invoice nonblocking, closed account debt blocking, visible server refusal with retained input.
- `supabase/tests/reservation_billing_accounts.sql`: genuine authenticated writes, full-show dates, quantities and tax rounding, immutable credits, stock restoration, rollback after a later line fails, event/non-event debt policy, paid-line protection and unchanged historical invoices.
- `supabase/tests/entry_account_billing.sql`: genuine staff and member RLS, entry/late/judge fees, deduplication, cancellation, payer transfer, actual payment RPC, personal-account isolation, authoritative member prices, split rounding/stock, modern non-event sale, statement, closing with debt and payment of a closed account. Private financial helpers are not executable by members.

SQL acceptance tests run in a transaction that ends in `ROLLBACK`, with candidate migrations included when not yet installed. Test-only policy relaxation isolates synthetic billing fixtures inside that rollback; it never approves or changes a real medical document. No test payment or capability persists. Supply explicit fixture IDs through psql variables; `reservation_billing_accounts.sql` uses a horse-free shavings option at 9.50, and `entry_account_billing.sql` additionally needs a member auth UID.
