-- Categories serve two different audiences that had been sharing one list.
--
--   * internal — how the shop organises itself: stock groupings, supplier
--     buckets, whatever helps staff find things on the products page. Never
--     shown to a customer.
--   * website  — how the storefront merchandises the catalogue: the browse
--     categories a shopper navigates.
--   * both     — a category that genuinely does both jobs.
--
-- Default is 'both', which is exactly today's behaviour: every existing
-- category currently appears in the admin and (subject to is_visible) on the
-- storefront. Nothing moves until a merchant deliberately re-scopes it.
--
-- This is a separate axis from the flags already on the table:
--   * status      — published / archived lifecycle
--   * is_visible  — merchant's show/hide switch
--   * show_in_*   — which storefront navigation surfaces it appears on
-- Scope answers "who is this category FOR", not "is it currently shown".

alter table public.categories
  add column if not exists scope text not null default 'both';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.categories'::regclass
      and conname = 'categories_scope_check'
  ) then
    alter table public.categories
      add constraint categories_scope_check
      check (scope in ('internal', 'website', 'both'));
  end if;
end
$$;

comment on column public.categories.scope is
  'Who the category is for: internal (staff organisation only), website (storefront browse), or both. Separate from status/is_visible, which say whether it is currently shown.';

-- The storefront filters every category read by scope, so index the rows it
-- actually wants rather than the whole table.
create index if not exists categories_tenant_scope_idx
  on public.categories (tenant_id, scope);

-- categories already has RLS with tenant-scoped policies; a new column
-- inherits them. Assert that rather than assume it.
do $$
begin
  if not exists (
    select 1 from pg_class
    where oid = 'public.categories'::regclass and relrowsecurity
  ) then
    raise exception 'public.categories does not have RLS enabled';
  end if;
end
$$;
