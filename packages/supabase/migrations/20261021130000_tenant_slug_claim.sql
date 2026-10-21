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
-- It also makes another store's old slug untakeable. A tenant_slug_history
-- row IS that store's redirect: the storefront resolves tenants.slug before
-- history, so a tenant that took the slug would silently capture every link
-- the renamed store already shared (live: tenant-1783087997714 ->
-- zahraa-beauty, held by no tenant, so any signup or rename could take it).
-- tenants_slug_key only sees current slugs, so a BEFORE INSERT OR UPDATE OF
-- slug trigger on tenants refuses, with 23505, a slug whose history row
-- belongs to a different tenant. It guards every writer, not only this
-- function: signup (ensureUniqueSlug skips such slugs first), the admin
-- app, convert_lead_atomic, and a member's direct PostgREST update.
--
-- Race: a rename frees its old slug when it commits, and the old slug's
-- history row is written in the same transaction. Without serialisation a
-- concurrent claim of that old slug could pass the trigger's check before
-- the history row is visible, then win the unique index once the rename
-- commits. Both sides therefore take a transaction advisory lock per slug:
-- the trigger on NEW.slug, and claim_tenant_slug on its old and new slug
-- (in a fixed order, so two opposite renames cannot deadlock) before it
-- writes. The trigger's check runs after the lock, in a fresh snapshot, and
-- sees the committed history row.
--
-- Prerequisite for the platform route shipped with this migration:
-- /api/tenant/slug calls claim_tenant_slug and answers 500 until it exists.
-- =====================================================================

revoke insert, update, delete, truncate, references, trigger
    on table public.tenant_slug_history
    from anon, authenticated;

-- One lock key per slug, shared by the trigger and claim_tenant_slug.
create or replace function public.tenant_slug_lock(p_slug text)
returns void
language sql
volatile
set search_path = ''
as $$
    select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('public.tenants.slug:' || p_slug, 0)
    );
$$;

comment on function public.tenant_slug_lock(text) is
    'Transaction advisory lock for one tenant slug. Serialises a rename (which frees its old slug and records it in tenant_slug_history) against any claim of that slug. Internal: called by tenants_slug_not_in_foreign_history and claim_tenant_slug.';

revoke all on function public.tenant_slug_lock(text) from public, anon, authenticated;
grant execute on function public.tenant_slug_lock(text) to service_role;

-- SECURITY DEFINER so the lock and the history read work the same for every
-- role that can write tenants.slug (tenant_slug_lock is service_role-only
-- when called directly). It reads only tenant_slug_history, which anon can
-- already read, and never consults current_user.
create or replace function public.tenants_slug_not_in_foreign_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
    perform public.tenant_slug_lock(new.slug);

    if exists (
        select 1
        from public.tenant_slug_history h
        where h.old_slug = new.slug
          and h.tenant_id <> new.id
    ) then
        raise exception 'slug % is another tenant''s old link', new.slug
            using errcode = '23505',
                  hint = 'tenant_slug_history keeps it redirecting to that tenant.';
    end if;

    return new;
end;
$$;

comment on function public.tenants_slug_not_in_foreign_history() is
    'BEFORE INSERT OR UPDATE OF slug on tenants: refuses (23505) a slug that tenant_slug_history holds for a different tenant, so a renamed store keeps its shared links.';

revoke all on function public.tenants_slug_not_in_foreign_history() from public, anon, authenticated;

drop trigger if exists tenants_slug_not_in_foreign_history on public.tenants;
create trigger tenants_slug_not_in_foreign_history
    before insert or update of slug on public.tenants
    for each row
    execute function public.tenants_slug_not_in_foreign_history();

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

    -- Both slugs, in a fixed order: the old one becomes a history row in
    -- this transaction, the new one is checked by the tenants trigger (which
    -- re-takes its lock; advisory locks are re-entrant).
    perform public.tenant_slug_lock(least(v_old, p_slug));
    perform public.tenant_slug_lock(greatest(v_old, p_slug));

    -- Two gates raise 23505 here and roll the whole transaction back:
    -- tenants_slug_not_in_foreign_history, when p_slug is another tenant's
    -- old link, and tenants_slug_key (UNIQUE), when another tenant holds it
    -- now or claims it concurrently.
    update public.tenants set slug = p_slug where id = p_tenant;

    -- The store is taking back its own old handle: that history row would
    -- otherwise redirect the slug to itself. The trigger above guarantees no
    -- other tenant's row exists for p_slug; the tenant_id filter keeps this
    -- delete from ever removing one.
    delete from public.tenant_slug_history
    where old_slug = p_slug
      and tenant_id = p_tenant;

    -- No ON CONFLICT: v_old was this tenant's current slug, so no history
    -- row can hold it (the trigger refuses a foreign one, and a reclaim
    -- deletes its own). A conflict means that invariant broke, and it must
    -- fail rather than reassign another store's redirect.
    insert into public.tenant_slug_history (old_slug, tenant_id)
    values (v_old, p_tenant);

    return v_old;
end;
$$;

comment on function public.claim_tenant_slug(uuid, text) is
    'Rename a tenant slug and record the old one in tenant_slug_history, atomically. Returns the previous slug. service_role only: /api/tenant/slug authorizes the caller (tenant admin of their active tenant) first.';

revoke all on function public.claim_tenant_slug(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_tenant_slug(uuid, text) to service_role;
