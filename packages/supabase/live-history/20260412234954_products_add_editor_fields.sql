alter table public.products
  add column if not exists reorder_point integer,
  add column if not exists status text not null default 'active'
    check (status in ('draft','active','archived')),
  add column if not exists product_type text not null default 'physical'
    check (product_type in ('physical','digital','service','bundle')),
  add column if not exists weight numeric,
  add column if not exists dimensions_json jsonb,
  add column if not exists duration_minutes integer,
  add column if not exists booking_enabled boolean not null default false,
  add column if not exists download_url text,
  add column if not exists file_size text,
  add column if not exists license_key_pattern text;

update public.products set status = 'archived' where is_archived = true and status <> 'archived';;
