-- Old handles keep working after a rename: old_slug → tenant_id; the
-- storefront falls back here on a tenants miss and 301s to the current slug.
create table if not exists public.tenant_slug_history (
    old_slug   text primary key,
    tenant_id  uuid not null references public.tenants(id) on delete cascade,
    created_at timestamptz not null default now()
);

create index if not exists tenant_slug_history_tenant_idx
    on public.tenant_slug_history (tenant_id);

alter table public.tenant_slug_history enable row level security;

-- Public by design: exists so anon storefront visitors following an old link
-- can be redirected. Exposes nothing the old URL didn't already reveal.
create policy "public_slug_history_read"
    on public.tenant_slug_history
    for select
    to anon, authenticated
    using (true);

-- Writes are service-role only (no insert/update/delete policies): the
-- slug-claim API performs them server-side after verifying membership.;
