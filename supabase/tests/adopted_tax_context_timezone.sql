\set ON_ERROR_STOP on
begin;
do $$ begin
 if public.billing_tax_effective_start('reservation-adoption-1','2026-10-26','2026-10-26T00:00:18Z','America/Toronto')<>'2026-10-25'::date then raise exception 'UTC_TORONTO_START';end if;
 if public.billing_tax_effective_start('manual','2026-10-26','2026-10-26T00:00:18Z','America/Toronto')<>'2026-10-26'::date then raise exception 'MANUAL_DATE_CHANGED';end if;
 if public.billing_tax_effective_start('reservation-adoption-1','2026-11-01','2026-10-26T00:00:18Z','America/Toronto')<>'2026-11-01'::date then raise exception 'EXPLICIT_FUTURE_DATE_CHANGED';end if;
 if public.billing_tax_effective_start('reservation-adoption-1','2026-10-26','2026-10-26T14:00:18Z','America/Toronto')<>'2026-10-26'::date then raise exception 'SAME_LOCAL_DAY_CHANGED';end if;
 if public.billing_tax_effective_start('reservation-adoption-1','2026-10-26','2026-10-26T23:00:18Z','Europe/Paris')<>'2026-10-27'::date then raise exception 'POSITIVE_UTC_OFFSET';end if;
end $$;
rollback;
