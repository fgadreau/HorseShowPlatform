-- Run only in the PREPROD SQL Editor. No customer data or secrets are read.
begin read only;
set local statement_timeout = '10s';

select jsonb_pretty(jsonb_build_object(
  'latest_migrations', (
    select coalesce(jsonb_agg(to_jsonb(m) order by m.version desc), '[]'::jsonb)
    from (
      select version, name
      from supabase_migrations.schema_migrations
      order by version desc
      limit 10
    ) m
  ),
  'billing_tables', (
    select coalesce(jsonb_agg(tablename order by tablename), '[]'::jsonb)
    from pg_tables
    where schemaname = 'public' and starts_with(tablename, 'billing_')
  ),
  'pdf_bucket', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'public', public, 'file_size_limit', file_size_limit,
      'allowed_mime_types', allowed_mime_types
    )), '[]'::jsonb)
    from storage.buckets where id = 'billing-pdfs'
  ),
  'worker_extensions', (
    select coalesce(jsonb_agg(extname order by extname), '[]'::jsonb)
    from pg_extension
    where extname in ('pg_cron', 'pg_net', 'supabase_vault')
  )
)) as preprod_inventory;

commit;
