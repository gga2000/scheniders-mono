-- The label's sealed-perfume line is now a "do not open the parcel" line that
-- any shop can switch on (Ali 2026-11-26). Shops that had the perfume line on
-- keep the new line on.
update public.app_settings
set value = (value - 'perfume_warning') || jsonb_build_object('no_open_warning', value -> 'perfume_warning' = 'true'::jsonb),
    updated_at = now()
where key = 'print_settings'
  and value ? 'perfume_warning';
