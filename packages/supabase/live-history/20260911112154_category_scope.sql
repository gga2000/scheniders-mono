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

create index if not exists categories_tenant_scope_idx
  on public.categories (tenant_id, scope);

do $$
begin
  if not exists (
    select 1 from pg_class
    where oid = 'public.categories'::regclass and relrowsecurity
  ) then
    raise exception 'public.categories does not have RLS enabled';
  end if;
end
$$;;
