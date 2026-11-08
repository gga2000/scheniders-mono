-- Second step of the send-key lockbox: the storefront now reads the Meta /
-- TikTok keys from tenant_capi_secrets only, so the old copies inside the
-- store design are wiped from the published config, the draft and every
-- saved version, and a trigger strips them from any later write (an editor
-- tab opened before the change, a version restore, a direct update).

-- Catch any key saved through the old screen since the copy, before wiping.
INSERT INTO public.tenant_capi_secrets AS s (tenant_id, meta_capi_token, tiktok_capi_token)
SELECT t.id,
       coalesce(nullif(btrim(t.store_config_v2 #>> '{globals,analytics_pixels,base,meta_capi_token}'), ''),
                nullif(btrim(t.store_config_v2_draft #>> '{globals,analytics_pixels,base,meta_capi_token}'), '')),
       coalesce(nullif(btrim(t.store_config_v2 #>> '{globals,analytics_pixels,base,tiktok_capi_token}'), ''),
                nullif(btrim(t.store_config_v2_draft #>> '{globals,analytics_pixels,base,tiktok_capi_token}'), ''))
  FROM public.tenants t
 WHERE coalesce(t.store_config_v2 #>> '{globals,analytics_pixels,base,meta_capi_token}',
                t.store_config_v2_draft #>> '{globals,analytics_pixels,base,meta_capi_token}',
                t.store_config_v2 #>> '{globals,analytics_pixels,base,tiktok_capi_token}',
                t.store_config_v2_draft #>> '{globals,analytics_pixels,base,tiktok_capi_token}') IS NOT NULL
ON CONFLICT (tenant_id) DO UPDATE SET
  meta_capi_token = coalesce(s.meta_capi_token, EXCLUDED.meta_capi_token),
  tiktok_capi_token = coalesce(s.tiktok_capi_token, EXCLUDED.tiktok_capi_token);

CREATE OR REPLACE FUNCTION public.strip_capi_keys(p_config jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_config #> '{globals,analytics_pixels,base}') = 'object'
     AND (p_config #> '{globals,analytics_pixels,base}') ?| ARRAY['meta_capi_token', 'tiktok_capi_token']
    THEN jsonb_set(p_config, '{globals,analytics_pixels,base}',
                   (p_config #> '{globals,analytics_pixels,base}') - 'meta_capi_token' - 'tiktok_capi_token')
    ELSE p_config
  END;
$$;

CREATE OR REPLACE FUNCTION public.tenants_strip_capi_keys()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.store_config_v2 := public.strip_capi_keys(NEW.store_config_v2);
  NEW.store_config_v2_draft := public.strip_capi_keys(NEW.store_config_v2_draft);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.config_versions_strip_capi_keys()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.config := public.strip_capi_keys(NEW.config);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tenants_strip_capi_keys ON public.tenants;
CREATE TRIGGER tenants_strip_capi_keys
  BEFORE INSERT OR UPDATE OF store_config_v2, store_config_v2_draft ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.tenants_strip_capi_keys();

DROP TRIGGER IF EXISTS config_versions_strip_capi_keys ON public.store_config_versions;
CREATE TRIGGER config_versions_strip_capi_keys
  BEFORE INSERT OR UPDATE OF config ON public.store_config_versions
  FOR EACH ROW EXECUTE FUNCTION public.config_versions_strip_capi_keys();

REVOKE ALL ON FUNCTION public.tenants_strip_capi_keys() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_versions_strip_capi_keys() FROM PUBLIC, anon, authenticated;

-- Wipe the copies already saved.
UPDATE public.tenants
   SET store_config_v2 = public.strip_capi_keys(store_config_v2),
       store_config_v2_draft = public.strip_capi_keys(store_config_v2_draft)
 WHERE store_config_v2 #> '{globals,analytics_pixels,base}' ?| ARRAY['meta_capi_token', 'tiktok_capi_token']
    OR store_config_v2_draft #> '{globals,analytics_pixels,base}' ?| ARRAY['meta_capi_token', 'tiktok_capi_token'];

UPDATE public.store_config_versions
   SET config = public.strip_capi_keys(config)
 WHERE config #> '{globals,analytics_pixels,base}' ?| ARRAY['meta_capi_token', 'tiktok_capi_token'];
