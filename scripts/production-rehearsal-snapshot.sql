\set ON_ERROR_STOP on

select to_regclass('public.blocks') is not null as canonical_contract \gset

\if :canonical_contract
select jsonb_build_object(
  'schema_contract', 'canonical',
  'invariants', jsonb_build_object(
    'organizations', jsonb_build_object('count', (select count(*) from public.organizations), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.organizations), md5(''))),
    'shows', jsonb_build_object('count', (select count(*) from public.shows), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.shows), md5(''))),
    'show_days', jsonb_build_object('count', (select count(*) from public.show_days), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.show_days), md5(''))),
    'blocks', jsonb_build_object('count', (select count(*) from public.blocks), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.blocks), md5(''))),
    'classes', jsonb_build_object('count', (select count(*) from public.classes), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.classes), md5(''))),
    'contacts', jsonb_build_object('count', (select count(*) from public.contacts), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.contacts), md5(''))),
    'horses', jsonb_build_object('count', (select count(*) from public.horses), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.horses), md5(''))),
    'horse_contacts', jsonb_build_object('count', (select count(*) from public.horse_contacts), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.horse_contacts), md5(''))),
    'entries', jsonb_build_object('count', (select count(*) from public.entries), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.entries), md5(''))),
    'entry_results', jsonb_build_object('count', (select count(*) from public.entry_results), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.entry_results), md5(''))),
    'stall_options', jsonb_build_object('count', (select count(*) from public.stall_options), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.stall_options), md5(''))),
    'stall_bookings', jsonb_build_object('count', (select count(*) from public.stall_bookings), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.stall_bookings), md5(''))),
    'invoices', jsonb_build_object('count', (select count(*) from public.invoices), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.invoices), md5(''))),
    'payments', jsonb_build_object('count', (select count(*) from public.payments), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.payments), md5(''))),
    'horse_documents', jsonb_build_object('count', (select count(*) from public.horse_documents), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.horse_documents), md5('')))
  ),
  'observations', jsonb_build_object(
    'invoice_line_items_count', (select count(*) from public.invoice_line_items),
    'invoice_line_items_total', coalesce((select sum(total_price) from public.invoice_line_items), 0),
    'invoice_total', coalesce((select sum(total_amount) from public.invoices), 0),
    'invoice_paid', coalesce((select sum(total_paid) from public.invoices), 0),
    'payments_total', coalesce((select sum(amount) from public.payments), 0),
    'entries_total_fees', coalesce((select sum(total_fees) from public.entries), 0)
  )
)::text;
\else
select jsonb_build_object(
  'schema_contract', 'legacy',
  'invariants', jsonb_build_object(
    'organizations', jsonb_build_object('count', (select count(*) from public.organizations), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.organizations), md5(''))),
    'shows', jsonb_build_object('count', (select count(*) from public.shows), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.shows), md5(''))),
    'show_days', jsonb_build_object('count', (select count(*) from public.show_days), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.show_days), md5(''))),
    'blocks', jsonb_build_object('count', (select count(*) from public.classes), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.classes), md5(''))),
    'classes', jsonb_build_object('count', (select count(*) from public.divisions), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.divisions), md5(''))),
    'contacts', jsonb_build_object('count', (select count(*) from public.contacts), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.contacts), md5(''))),
    'horses', jsonb_build_object('count', (select count(*) from public.horses), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.horses), md5(''))),
    'horse_contacts', jsonb_build_object('count', (select count(*) from public.horse_contacts), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.horse_contacts), md5(''))),
    'entries', jsonb_build_object('count', (select count(*) from public.entries), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.entries), md5(''))),
    'entry_results', jsonb_build_object('count', (select count(*) from public.entry_results), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.entry_results), md5(''))),
    'stall_options', jsonb_build_object('count', (select count(*) from public.stall_options), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.stall_options), md5(''))),
    'stall_bookings', jsonb_build_object('count', (select count(*) from public.stall_bookings), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.stall_bookings), md5(''))),
    'invoices', jsonb_build_object('count', (select count(*) from public.invoices), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.invoices), md5(''))),
    'payments', jsonb_build_object('count', (select count(*) from public.payments), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.payments), md5(''))),
    'horse_documents', jsonb_build_object('count', (select count(*) from public.horse_health_documents), 'id_hash', coalesce((select md5(string_agg(id::text, ',' order by id)) from public.horse_health_documents), md5('')))
  ),
  'observations', jsonb_build_object(
    'invoice_line_items_count', (select count(*) from public.invoice_line_items),
    'invoice_line_items_total', coalesce((select sum(total_price) from public.invoice_line_items), 0),
    'invoice_total', coalesce((select sum(total_amount) from public.invoices), 0),
    'invoice_paid', coalesce((select sum(total_paid) from public.invoices), 0),
    'payments_total', coalesce((select sum(amount) from public.payments), 0),
    'entries_total_fees', coalesce((select sum(total_fees) from public.entries), 0)
  )
)::text;
\endif
