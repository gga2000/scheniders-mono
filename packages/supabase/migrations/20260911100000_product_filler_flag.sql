-- Filler products: catalogue depth the merchant does not actually hold in stock.
--
-- A filler product is a real, orderable product — the storefront treats it
-- exactly like any other, and a customer can place a COD order for it. What
-- changes is the *operator's* view: filler products are not part of main
-- stock, so the order product picker tucks them behind a collapsed group
-- instead of mixing them into the list staff pick from every day.
--
-- This is deliberately a separate axis from the flags that already exist:
--   * is_supply  — packaging/internal, never sellable at all
--   * is_visible — hidden from the storefront entirely
--   * status     — the merchant's Draft / Active / Archived choice
-- A filler product is visible, active, sellable, and not a supply. It is just
-- not something the shop keeps on the shelf.

alter table public.products
  add column if not exists is_filler boolean not null default false;

comment on column public.products.is_filler is
  'Catalogue filler: orderable by customers but not held in main stock. Collapsed in the operator order product picker. Independent of is_supply / is_visible / status.';

-- The picker splits one tenant''s catalogue into main vs filler on every open,
-- and filler is the small side, so a partial index on the true rows is the
-- cheap half to maintain.
create index if not exists products_tenant_filler_idx
  on public.products (tenant_id)
  where is_filler;

-- RLS is already enabled on public.products and every existing policy is
-- tenant-scoped; a new column inherits them, so there is no new policy to add.
-- Guard that assumption rather than trusting it.
do $$
begin
  if not exists (
    select 1 from pg_class
    where oid = 'public.products'::regclass and relrowsecurity
  ) then
    raise exception 'public.products does not have RLS enabled';
  end if;
end
$$;
