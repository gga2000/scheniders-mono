-- The tenants_strip_capi_keys trigger runs as the calling role; without this grant every
-- browser store-builder autosave fails with 42501 "permission denied for function strip_capi_keys".
-- strip_capi_keys is a pure IMMUTABLE jsonb transform, so granting EXECUTE is safe.
GRANT EXECUTE ON FUNCTION public.strip_capi_keys(jsonb) TO authenticated;
