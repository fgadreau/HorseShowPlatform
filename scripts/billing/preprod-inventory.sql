-- Paste only in the PREPROD SQL editor. Read-only; no customer data or secrets.
begin read only;
set local statement_timeout='10s';
select version from supabase_migrations.schema_migrations order by version;
select tablename from pg_tables where schemaname='public' and tablename like 'billing\_%' escape '\' order by tablename;
select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='billing-pdfs';
select count(*) as existing_pdf_objects from storage.objects where bucket_id='billing-pdfs';
select policyname,roles,cmd,qual,with_check from pg_policies where schemaname='storage' and tablename='objects';
select extname,extversion from pg_extension where extname in ('pg_cron','pg_net','supabase_vault');
select proname,prosecdef,proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (proname like 'billing_hosted_%' or proname in ('billing_claim_document','billing_pdf_complete','billing_stripe_receive_direct')) order by proname;
-- Do not select cron.job.command, Vault contents, auth users or Stripe keys.
commit;
