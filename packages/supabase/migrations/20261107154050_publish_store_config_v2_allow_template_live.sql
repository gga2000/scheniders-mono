-- 20261021120000_publish_store_config_v2_allow_template.sql was never applied
-- to the live project, so publishing a store whose config carries `template`
-- was refused there. Add the key to the allowlist on the current body (which
-- keeps the is_tenant_admin check from 20261107152520).
DO $mig$
DECLARE
  v_def text := pg_get_functiondef('public.publish_store_config_v2(uuid,jsonb,jsonb,bigint)'::regprocedure);
  v_new text;
BEGIN
  v_new := replace(v_def, $s$'custom_pages'
    )$s$, $s$'custom_pages', 'template'
    )$s$);
  IF v_new = v_def THEN
    RAISE EXCEPTION 'publish_store_config_v2: allowlist not found';
  END IF;
  EXECUTE v_new;
END
$mig$;
