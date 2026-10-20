-- =====================================================================
-- Store-handle claim: atomic rename + slug-history bookkeeping
-- =====================================================================
-- PATCH /api/tenant/slug (platform) renames a tenant's slug and records the
-- old one in tenant_slug_history so links already shared keep redirecting.
-- As three separate PostgREST calls those writes could half-apply: a rename
-- whose history insert failed silently breaks every shared link, which is
-- the one thing the feature exists to prevent. This function runs them in
-- one transaction.
--
-- It also closes a grant gap on tenant_slug_history (20260817125224): anon
-- and authenticated hold INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER
-- through the default privileges. RLS has no write policies, so the DML is
-- already denied, but TRUNCATE is not subject to RLS. Only SELECT is needed
-- (public_slug_history_read serves the storefront's old-link redirect).
--
-- Prerequisite for the platform route shipped with this migration:
-- /api/tenant/slug calls claim_tenant_slug and answers 500 until it exists.
-- =====================================================================

revoke insert, update, delete, truncate, references, trigger
    on table public.tenant_slug_history
    from anon, authenticated;

create or replace function public.claim_tenant_slug(p_tenant uuid, p_slug text)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
    v_old text;
begin
    -- Same rule as apps/platform/lib/tenant-slug.ts (the reserved-word list
    -- stays in the app); repeated here so no caller can write a slug the
    -- storefront router cannot serve.
    if p_slug is null
       or p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$'
       or position('--' in p_slug) > 0 then
        raise exception 'invalid slug: %', p_slug using errcode = '22023';
    end if;

    select t.slug into v_old
    from public.tenants t
    where t.id = p_tenant
    for update;

    if not found then
        raise exception 'tenant % not found', p_tenant using errcode = 'P0002';
    end if;

    if v_old = p_slug then
        return v_old;
    end if;

    -- tenants_slug_key (UNIQUE) is the final gate: a concurrent claim of the
    -- same slug raises 23505 here and the whole transaction rolls back.
    update public.tenants set slug = p_slug where id = p_tenant;

    -- The newly claimed slug shadows any history row pointing elsewhere.
    delete from public.tenant_slug_history where old_slug = p_slug;

    insert into public.tenant_slug_history (old_slug, tenant_id)
    values (v_old, p_tenant)
    on conflict (old_slug) do update
        set tenant_id = excluded.tenant_id,
            created_at = now();

    return v_old;
end;
$$;

comment on function public.claim_tenant_slug(uuid, text) is
    'Rename a tenant slug and record the old one in tenant_slug_history, atomically. Returns the previous slug. service_role only: /api/tenant/slug authorizes the caller (tenant admin of their active tenant) first.';

revoke all on function public.claim_tenant_slug(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_tenant_slug(uuid, text) to service_role;
