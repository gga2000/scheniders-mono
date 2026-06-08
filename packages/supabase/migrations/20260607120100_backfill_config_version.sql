-- config_version was never maintained for tenants seeded directly (bypassing
-- publish_store_config_v2). The storefront gates V2 on store_config_v2 presence,
-- not on this column, so these tenants ALREADY render V2 — the flag just lied.
-- Backfill it to match reality so future code can trust it.
UPDATE public.tenants
   SET config_version = 2
 WHERE store_config_v2 IS NOT NULL
   AND config_version IS DISTINCT FROM 2;
