-- REVIEW TEMPLATE. Do not run before the explicit remote-trial authorization.
-- Run only in the PREPROD project SQL editor after enabling pg_cron/pg_net/Vault.
-- Vault names below are populated securely in the console, not in this file.
begin;
do $$ begin
 if not exists(select 1 from pg_extension where extname='pg_cron') or not exists(select 1 from pg_extension where extname='pg_net') then raise exception 'Cron/pg_net required';end if;
 if to_regprocedure('public.billing_hosted_claim(text)') is null then raise exception 'Billing hosted migration required';end if;
 if (select count(*) from vault.decrypted_secrets where name in ('hsp_billing_worker_secret','hsp_billing_vercel_bypass'))<>2 then raise exception 'Two unique Vault entries required';end if;
 if exists(select 1 from vault.decrypted_secrets where name in ('hsp_billing_worker_secret','hsp_billing_vercel_bypass') and length(decrypted_secret)<32) then raise exception 'Invalid Vault secret';end if;
end $$;
select cron.schedule('hsp-billing-stripe-preprod','* * * * *',$job$
 select net.http_post(
  url:='https://preprod.horseshowplatform.com/api/billing/run-stripe',
  headers:=jsonb_build_object('Content-Type','application/json',
   'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='hsp_billing_worker_secret'),
   'x-vercel-protection-bypass',(select decrypted_secret from vault.decrypted_secrets where name='hsp_billing_vercel_bypass')),
  body:='{}'::jsonb,timeout_milliseconds:=230000);
$job$);
select cron.schedule('hsp-billing-pdf-preprod','* * * * *',$job$
 select net.http_post(
  url:='https://preprod.horseshowplatform.com/api/billing-documents/run-pdf',
  headers:=jsonb_build_object('Content-Type','application/json',
   'Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='hsp_billing_worker_secret'),
   'x-vercel-protection-bypass',(select decrypted_secret from vault.decrypted_secrets where name='hsp_billing_vercel_bypass')),
  body:='{}'::jsonb,timeout_milliseconds:=230000);
$job$);
commit;
-- Later pause, only with authorization: cron.unschedule each of these two names.
-- Never delete the inbox/outbox or historical PDF artifacts to pause the pilot.
