alter table public.show_score_paid_warmups
  add column if not exists arena text,
  add column if not exists schedule_start_mode text,
  add column if not exists schedule_start_time text;
