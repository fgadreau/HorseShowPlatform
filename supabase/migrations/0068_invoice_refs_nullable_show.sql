-- Allow association-level invoices without a show while keeping tenant checks.

create or replace function public.set_invoice_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
begin
  if new.show_id is not null then
    select organization_id into target_org_id
    from public.shows
    where id = new.show_id;

    if not found then
      raise exception 'Show % does not exist', new.show_id using errcode = 'foreign_key_violation';
    end if;

    if new.organization_id is not null and new.organization_id is distinct from target_org_id then
      raise exception 'Invoice organization % does not match show organization %', new.organization_id, target_org_id
        using errcode = 'check_violation';
    end if;

    new.organization_id := target_org_id;
  else
    if new.organization_id is null then
      raise exception 'Association-level invoices require organization_id' using errcode = 'not_null_violation';
    end if;

    select id into target_org_id
    from public.organizations
    where id = new.organization_id;

    if not found then
      raise exception 'Invoice organization % does not exist', new.organization_id using errcode = 'foreign_key_violation';
    end if;
  end if;

  if not exists (select 1 from public.contacts where id = new.payer_contact_id) then
    raise exception 'Payer contact % does not exist', new.payer_contact_id using errcode = 'foreign_key_violation';
  end if;

  if not public.contact_is_linked_to_org(new.payer_contact_id, target_org_id) then
    raise exception 'Invoice payer % is not linked to invoice organization %', new.payer_contact_id, target_org_id
      using errcode = 'check_violation';
  end if;

  new.organization_id := target_org_id;
  return new;
end;
$$;
