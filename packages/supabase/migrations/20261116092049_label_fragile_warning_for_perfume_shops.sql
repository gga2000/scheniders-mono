-- Shipping labels print the glass tape and the sealed-perfume warning only when
-- the shop switches them on (print_settings.fragile_warning). Shops that already
-- sell perfume keep the warnings they print today; every other shop starts off.
insert into public.app_settings (tenant_id, key, value, updated_at)
select t.id, 'print_settings', jsonb_build_object('fragile_warning', true), now()
from public.tenants t
where exists (
    select 1
    from public.products p
    join public.categories c on c.id = p.category_id
    where p.tenant_id = t.id
      and (c.name like '%عطر%' or c.slug in ('perfume', 'fragrance', 'العطور'))
)
on conflict (key, tenant_id) do update
    set value = coalesce(public.app_settings.value, '{}'::jsonb) || jsonb_build_object('fragile_warning', true),
        updated_at = now();
