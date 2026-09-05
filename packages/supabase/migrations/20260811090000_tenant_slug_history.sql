-- ═══════════════════════════════════════════════════════════════════
-- Tenant slug history — old handles keep working after a rename
-- ═══════════════════════════════════════════════════════════════════
-- "Claim your store handle" (audit S3/UX2-13 follow-up): when a merchant
-- renames their slug, links already shared on WhatsApp must not die.
-- Each rename records old_slug → tenant_id here; the storefront falls
-- back to this table when a slug misses `tenants` and 301s to the
-- tenant's CURRENT slug (chains collapse automatically because we store
-- the tenant id, not the next slug).
--
-- A row is removed if its old_slug is later claimed as a live slug by
-- any tenant (live slugs always win — resolution checks `tenants` first,
-- and the claim API deletes the shadowed history row).

create table if not exists public.tenant_slug_history (
    old_slug   text primary key,
    tenant_id  uuid not null references public.tenants(id) on delete cascade,
    created_at timestamptz not null default now()
);

create index if not exists tenant_slug_history_tenant_idx
    on public.tenant_slug_history (tenant_id);

alter table public.tenant_slug_history enable row level security;

-- The mapping is public by design: it exists so anonymous storefront
-- visitors following an old link can be redirected. It exposes nothing
-- beyond what the old URL itself already revealed.
create policy "public_slug_history_read"
    on public.tenant_slug_history
    for select
    to anon, authenticated
    using (true);

-- Writes are service-role only (no insert/update/delete policies): the
-- platform's slug-claim API performs them server-side after verifying
-- tenant membership + admin role.
