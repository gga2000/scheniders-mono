-- B7: the store-design triggers strip the Meta / TikTok send keys as their
-- owner, so signed-in users no longer need EXECUTE on strip_capi_keys.
--
-- On 8 Nov every store-builder autosave failed with 42501 because the trigger
-- ran strip_capi_keys as the calling user; 20261108191905 fixed it by granting
-- that function to authenticated. The triggers now run as their owner (fixed
-- search_path, they only rewrite NEW), and the grant is taken back so the
-- function is not callable through the API.

CREATE OR REPLACE FUNCTION public.tenants_strip_capi_keys()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
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
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.config := public.strip_capi_keys(NEW.config);
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tenants_strip_capi_keys() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.config_versions_strip_capi_keys() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.strip_capi_keys(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.strip_capi_keys(jsonb) TO service_role;
