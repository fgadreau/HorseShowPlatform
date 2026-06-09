create or replace function public.assert_no_open_invoice_balance_for_stall_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  blocking_invoice record;
begin
  if not coalesce(new.billable, true) or new.status in ('cancelled', 'completed') then
    return new;
  end if;

  select
    i.invoice_number,
    i.balance_due,
    s.name as show_name
  into blocking_invoice
  from public.invoices i
  join public.shows s on s.id = i.show_id
  where i.organization_id = new.organization_id
    and i.payer_contact_id = new.payer_contact_id
    and i.show_id <> new.show_id
    and i.status not in ('paid', 'void')
    and i.balance_due > 0
  order by i.due_date nulls first, i.issue_date, i.created_at, i.id
  limit 1;

  if blocking_invoice.invoice_number is not null then
    raise exception 'Solde de facture ouvert: impossible de creer une reservation pour un autre evenement de cette association.'
      using
        errcode = 'P0001',
        detail = format(
          'Facture #%s (%s) - solde %s.',
          blocking_invoice.invoice_number,
          blocking_invoice.show_name,
          blocking_invoice.balance_due
        );
  end if;

  return new;
end;
$$;

drop trigger if exists stall_bookings_zz_block_open_invoice_balance on public.stall_bookings;
create trigger stall_bookings_zz_block_open_invoice_balance
before insert or update of stall_option_id, show_id, payer_contact_id, status, billable, quantity, unit_price, total_price on public.stall_bookings
for each row execute function public.assert_no_open_invoice_balance_for_stall_booking();
