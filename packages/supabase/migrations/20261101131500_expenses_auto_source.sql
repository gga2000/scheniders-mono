-- Auto-posted expenses (Meta ad spend). Manual rows keep source = null and are never touched by the sync.
-- RLS on public.expenses is unchanged; the sync writes with the service role, tenant_id always set.
alter table public.expenses
  add column if not exists source text,
  add column if not exists external_key text;

create unique index if not exists expenses_tenant_external_key_uidx
  on public.expenses (tenant_id, external_key)
  where external_key is not null;
