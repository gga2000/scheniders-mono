-- Advisor follow-up on the product_attributes migration.
--
-- 1. tg_product_attribute_defs_updated_at had a role-mutable search_path.
-- 2. Both trigger functions were EXECUTE-able by anon/authenticated over
--    PostgREST RPC. A trigger function has no business being callable
--    directly — and the tenant guard is SECURITY DEFINER, so exposing it
--    is exactly the shape of hole worth closing even though calling it
--    without trigger context would error.

CREATE OR REPLACE FUNCTION public.tg_product_attribute_defs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_product_attribute_values_tenant_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_product_attribute_defs_updated_at()     FROM PUBLIC, anon, authenticated;;
