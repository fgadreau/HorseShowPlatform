alter table public.class_template_divisions
add column if not exists default_payout_schedule_type text not null default 'none',
add column if not exists default_added_money numeric(12, 2) not null default 0,
add column if not exists default_retainage_percent numeric(5, 2),
add column if not exists default_trophy_or_plaque_fee numeric(12, 2) not null default 0,
add column if not exists default_sanctioning_fee_percent numeric(5, 2),
add column if not exists default_payout_rules jsonb not null default '{}'::jsonb,
add column if not exists default_payout_notes text;

alter table public.divisions
add column if not exists payout_schedule_type text not null default 'none',
add column if not exists added_money numeric(12, 2) not null default 0,
add column if not exists retainage_percent numeric(5, 2),
add column if not exists trophy_or_plaque_fee numeric(12, 2) not null default 0,
add column if not exists sanctioning_fee_percent numeric(5, 2),
add column if not exists payout_rules jsonb not null default '{}'::jsonb,
add column if not exists payout_notes text;

alter table public.class_template_divisions
drop constraint if exists class_template_divisions_default_payout_schedule_type_check;

alter table public.class_template_divisions
add constraint class_template_divisions_default_payout_schedule_type_check
check (default_payout_schedule_type in (
  'none',
  'nrha_schedule_a',
  'nrha_schedule_b',
  'house_concentrated',
  'house_distributed',
  'house_custom',
  'jackpot_100'
));

alter table public.divisions
drop constraint if exists divisions_payout_schedule_type_check;

alter table public.divisions
add constraint divisions_payout_schedule_type_check
check (payout_schedule_type in (
  'none',
  'nrha_schedule_a',
  'nrha_schedule_b',
  'house_concentrated',
  'house_distributed',
  'house_custom',
  'jackpot_100'
));

alter table public.class_template_divisions
drop constraint if exists class_template_divisions_default_payout_money_check,
drop constraint if exists class_template_divisions_default_payout_percent_check;

alter table public.class_template_divisions
add constraint class_template_divisions_default_payout_money_check
check (default_added_money >= 0 and default_trophy_or_plaque_fee >= 0),
add constraint class_template_divisions_default_payout_percent_check
check (
  (default_retainage_percent is null or (default_retainage_percent >= 0 and default_retainage_percent <= 100))
  and (default_sanctioning_fee_percent is null or (default_sanctioning_fee_percent >= 0 and default_sanctioning_fee_percent <= 100))
);

alter table public.divisions
drop constraint if exists divisions_payout_money_check,
drop constraint if exists divisions_payout_percent_check;

alter table public.divisions
add constraint divisions_payout_money_check
check (added_money >= 0 and trophy_or_plaque_fee >= 0),
add constraint divisions_payout_percent_check
check (
  (retainage_percent is null or (retainage_percent >= 0 and retainage_percent <= 100))
  and (sanctioning_fee_percent is null or (sanctioning_fee_percent >= 0 and sanctioning_fee_percent <= 100))
);
