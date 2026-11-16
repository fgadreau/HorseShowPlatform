-- Receipts may span multiple shows, but an export must retain one currency.
begin;
do $$declare source text;needle text:='where p.organization_id=c.organization_id and (p.received_at';begin
 select pg_get_functiondef('private.billing_accounting_payload(uuid,text,text,date,date,date)'::regprocedure) into source;
 if position(needle in source)=0 then raise exception 'ACCOUNTING_RECEIPTS_CONTRACT_CHANGED';end if;
 execute replace(source,needle,'where p.organization_id=c.organization_id and p.currency=c.currency and (p.received_at');
end $$;
commit;
