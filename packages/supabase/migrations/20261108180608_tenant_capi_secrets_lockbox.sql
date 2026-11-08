-- Lockbox for the Meta / TikTok Conversions API send keys.
-- The keys used to live inside the store design (store_config_v2 and its
-- draft and saved versions), which every editor session downloads. They now
-- live here: RLS on with no policies, so only the service role (the
-- storefront server) can read a key. Merchants see only "saved" and the last
-- four characters through capi_token_status, and change a key through
-- set_capi_token (tenant admins only).

CREATE TABLE IF NOT EXISTS public.tenant_capi_secrets (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  meta_capi_token text CHECK (meta_capi_token IS NULL OR length(meta_capi_token) BETWEEN 1 AND 2048),
  tiktok_capi_token text CHECK (tiktok_capi_token IS NULL OR length(tiktok_capi_token) BETWEEN 1 AND 2048),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.tenant_capi_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tenant_capi_secrets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_capi_secrets TO service_role;

-- What the editor may know: saved or not, and the last four characters.
CREATE OR REPLACE FUNCTION public.capi_token_status(p_tenant_id uuid)
RETURNS TABLE (network text, saved boolean, last4 text, updated_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT n.network,
           n.token IS NOT NULL,
           CASE WHEN n.token IS NULL THEN NULL ELSE right(n.token, 4) END,
           s.updated_at
      FROM (SELECT 1) one
      LEFT JOIN public.tenant_capi_secrets s ON s.tenant_id = p_tenant_id
      CROSS JOIN LATERAL (VALUES ('meta', s.meta_capi_token), ('tiktok', s.tiktok_capi_token)) AS n(network, token);
END;
$$;

-- Save, replace (p_token set) or delete (p_token NULL or blank) one key.
CREATE OR REPLACE FUNCTION public.set_capi_token(p_tenant_id uuid, p_network text, p_token text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token text := nullif(btrim(p_token), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids())
     OR NOT public.is_tenant_admin(p_tenant_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_network NOT IN ('meta', 'tiktok') THEN
    RAISE EXCEPTION 'unknown network' USING ERRCODE = '22023';
  END IF;
  IF v_token IS NOT NULL AND (length(v_token) > 2048 OR v_token ~ '\s') THEN
    RAISE EXCEPTION 'invalid token' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.tenant_capi_secrets AS s (tenant_id, meta_capi_token, tiktok_capi_token, updated_at, updated_by)
  VALUES (
    p_tenant_id,
    CASE WHEN p_network = 'meta' THEN v_token END,
    CASE WHEN p_network = 'tiktok' THEN v_token END,
    now(),
    v_uid
  )
  ON CONFLICT (tenant_id) DO UPDATE SET
    meta_capi_token = CASE WHEN p_network = 'meta' THEN v_token ELSE s.meta_capi_token END,
    tiktok_capi_token = CASE WHEN p_network = 'tiktok' THEN v_token ELSE s.tiktok_capi_token END,
    updated_at = now(),
    updated_by = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.capi_token_status(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_capi_token(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.capi_token_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_capi_token(uuid, text, text) TO authenticated;

-- Copy the keys already saved in store designs (published first, else draft).
-- The old copies are wiped by a follow-up migration once the storefront reads
-- from here, so live order tracking never has a gap.
INSERT INTO public.tenant_capi_secrets (tenant_id, meta_capi_token, tiktok_capi_token)
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
ON CONFLICT (tenant_id) DO NOTHING;
