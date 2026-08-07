-- Persist the ShowScore championship update mailing list and campaign audit
-- trail in the shared HSP database. Public subscribe/unsubscribe and campaign
-- writes are performed by the dedicated Edge Functions with the service role;
-- association managers receive read-only access through RLS.

create extension if not exists pgcrypto;

create table if not exists public.show_score_championship_update_subscribers (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  email text not null,
  name text not null default '',
  language text not null default 'fr'
    check (language in ('fr', 'en')),
  status text not null default 'subscribed'
    check (status in ('subscribed', 'unsubscribed')),
  consent_source text not null default '',
  consent_text text not null default '',
  source_url text not null default '',
  unsubscribe_token_hash text,
  unsubscribe_token_issued_at timestamptz,
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email = lower(email))
);

create unique index if not exists idx_championship_update_subscribers_org_email
  on public.show_score_championship_update_subscribers (organization_id, email);
create index if not exists idx_championship_update_subscribers_org_status
  on public.show_score_championship_update_subscribers (organization_id, status);

drop trigger if exists championship_update_subscribers_touch_updated_at
  on public.show_score_championship_update_subscribers;
create trigger championship_update_subscribers_touch_updated_at
  before update on public.show_score_championship_update_subscribers
  for each row execute function public.showscore_set_updated_at();

create table if not exists public.show_score_championship_update_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null,
  season_id text not null default '',
  mode text not null default 'campaign'
    check (mode in ('campaign', 'test')),
  subject text not null default '',
  message text not null default '',
  public_url text not null default '',
  sent_by uuid,
  sent_at timestamptz,
  recipient_count integer not null default 0,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  status text not null default 'draft'
    check (status in ('draft', 'sending', 'sent', 'partial_failed', 'failed')),
  error_message text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_championship_update_campaigns_org_sent
  on public.show_score_championship_update_campaigns (organization_id, sent_at desc);

drop trigger if exists championship_update_campaigns_touch_updated_at
  on public.show_score_championship_update_campaigns;
create trigger championship_update_campaigns_touch_updated_at
  before update on public.show_score_championship_update_campaigns
  for each row execute function public.showscore_set_updated_at();

create table if not exists public.show_score_championship_update_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null
    references public.show_score_championship_update_campaigns(id)
    on delete cascade,
  subscriber_id uuid
    references public.show_score_championship_update_subscribers(id)
    on delete set null,
  email text not null,
  status text not null
    check (status in ('sent', 'failed')),
  resend_id text,
  error_message text not null default '',
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_championship_update_deliveries_campaign
  on public.show_score_championship_update_deliveries (campaign_id);

alter table public.show_score_championship_update_subscribers enable row level security;
alter table public.show_score_championship_update_campaigns enable row level security;
alter table public.show_score_championship_update_deliveries enable row level security;

drop policy if exists "ShowScore managers read championship update subscribers"
  on public.show_score_championship_update_subscribers;
create policy "ShowScore managers read championship update subscribers"
  on public.show_score_championship_update_subscribers for select to authenticated
  using (public.showscore_current_user_can_manage_organization(organization_id));

drop policy if exists "ShowScore managers read championship update campaigns"
  on public.show_score_championship_update_campaigns;
create policy "ShowScore managers read championship update campaigns"
  on public.show_score_championship_update_campaigns for select to authenticated
  using (public.showscore_current_user_can_manage_organization(organization_id));

drop policy if exists "ShowScore managers read championship update deliveries"
  on public.show_score_championship_update_deliveries;
create policy "ShowScore managers read championship update deliveries"
  on public.show_score_championship_update_deliveries for select to authenticated
  using (
    exists (
      select 1
      from public.show_score_championship_update_campaigns campaign
      where campaign.id = show_score_championship_update_deliveries.campaign_id
        and public.showscore_current_user_can_manage_organization(
          campaign.organization_id
        )
    )
  );

revoke all on public.show_score_championship_update_subscribers from anon;
revoke all on public.show_score_championship_update_campaigns from anon;
revoke all on public.show_score_championship_update_deliveries from anon;
grant select on public.show_score_championship_update_subscribers to authenticated;
grant select on public.show_score_championship_update_campaigns to authenticated;
grant select on public.show_score_championship_update_deliveries to authenticated;

notify pgrst, 'reload schema';
