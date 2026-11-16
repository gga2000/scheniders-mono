-- The label's "handle with care" tape and its sealed-perfume line are now two
-- switches. Shops that had the combined switch on (the perfume shops) keep both.
update public.app_settings
set value = value || jsonb_build_object('perfume_warning', true),
    updated_at = now()
where key = 'print_settings'
  and (value ->> 'fragile_warning')::boolean is true;
