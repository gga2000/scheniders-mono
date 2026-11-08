-- Security audit round 2: order RPCs (create/merge/split/return/after-sale)
-- are SECURITY DEFINER and checked store membership only, so a "viewer" could
-- still change orders through them even after the RLS role policies of
-- 20261108182347. Root-cause fix: one trigger on orders that applies the role
-- model to EVERY write made on behalf of a signed-in user, whichever path it
-- takes (direct REST call or a definer function). It reads the JWT role, not
-- current_user, so definer functions are covered too. Storefront shoppers
-- (anon), server code (service_role) and cron (no JWT) are not affected.
CREATE OR REPLACE FUNCTION public.orders_require_staff_permission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_perm text;
BEGIN
    IF coalesce(auth.role(), '') <> 'authenticated' THEN
        RETURN coalesce(NEW, OLD);
    END IF;
    v_perm := CASE TG_OP WHEN 'INSERT' THEN 'orders.create'
                         WHEN 'UPDATE' THEN 'orders.edit'
                         ELSE 'orders.delete' END;
    IF NOT public.has_tenant_permission(coalesce(NEW.tenant_id, OLD.tenant_id), v_perm) THEN
        RAISE EXCEPTION 'Your role cannot do this (needs %)', v_perm USING ERRCODE = '42501';
    END IF;
    RETURN coalesce(NEW, OLD);
END;
$function$;

REVOKE ALL ON FUNCTION public.orders_require_staff_permission() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_orders_require_staff_permission
  BEFORE INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_require_staff_permission();
