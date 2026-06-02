alter table public.shows
add column if not exists reservation_payment_policy text not null default 'pay_at_booking',
add column if not exists entry_payment_policy text not null default 'card_on_file_preauth',
add column if not exists entry_preauth_timing text not null default 'show_start',
add column if not exists entry_preauth_time time not null default '08:00',
add column if not exists entry_settlement_timing text not null default 'show_end',
add column if not exists entry_settlement_due_time time not null default '14:00',
add column if not exists entry_auto_capture_enabled boolean not null default true,
add column if not exists entry_preauth_amount_strategy text not null default 'entry_balance',
add column if not exists entry_preauth_margin_percent numeric(5, 2) not null default 0;

alter table public.shows
drop constraint if exists shows_reservation_payment_policy_check,
drop constraint if exists shows_entry_payment_policy_check,
drop constraint if exists shows_entry_preauth_timing_check,
drop constraint if exists shows_entry_settlement_timing_check,
drop constraint if exists shows_entry_preauth_amount_strategy_check,
drop constraint if exists shows_entry_preauth_margin_percent_check;

alter table public.shows
add constraint shows_reservation_payment_policy_check
  check (reservation_payment_policy in ('pay_at_booking', 'manual')),
add constraint shows_entry_payment_policy_check
  check (entry_payment_policy in ('card_on_file_preauth', 'manual')),
add constraint shows_entry_preauth_timing_check
  check (entry_preauth_timing in ('show_start', 'manual')),
add constraint shows_entry_settlement_timing_check
  check (entry_settlement_timing in ('show_end', 'manual')),
add constraint shows_entry_preauth_amount_strategy_check
  check (entry_preauth_amount_strategy in ('entry_balance', 'entry_balance_with_margin')),
add constraint shows_entry_preauth_margin_percent_check
  check (entry_preauth_margin_percent >= 0);
