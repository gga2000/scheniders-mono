alter table public.products
  add column if not exists is_filler boolean not null default false;

comment on column public.products.is_filler is
  'Catalogue filler: orderable by customers but not held in main stock. Collapsed in the operator order product picker. Independent of is_supply / is_visible / status.';

create index if not exists products_tenant_filler_idx
  on public.products (tenant_id)
  where is_filler;

do $$
begin
  if not exists (
    select 1 from pg_class
    where oid = 'public.products'::regclass and relrowsecurity
  ) then
    raise exception 'public.products does not have RLS enabled';
  end if;
end
$$;;
