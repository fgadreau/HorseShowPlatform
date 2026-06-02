insert into public.sanctioning_bodies (code, name, back_number_policy, rule_notes)
values
  ('AQR', 'AQR / maison', 'horse', 'Association-hosted division, not NRHA sanctioned unless NRHA is also selected.')
on conflict (code) do update
set
  name = excluded.name,
  back_number_policy = excluded.back_number_policy,
  rule_notes = excluded.rule_notes,
  updated_at = now();
