-- Recorded from live schema_migrations; applied 2026-09-09 from branch
-- feat/flagship-template (PR #80, source commit 4d7b6e8e, drafted there as
-- 20260910010000_lookup_order_customer_stages.sql); do not edit.
-- Body below is the exact statement that ran under version 20260909220811.
-- Grants are later tightened by 20260913100000_revoke_anon_execute_secdef_functions
-- (REVOKE FROM PUBLIC; anon keeps EXECUTE by design); replay order is correct.

DROP FUNCTION IF EXISTS public.lookup_order(uuid, text, text);

CREATE OR REPLACE FUNCTION public.lookup_order(p_tenant_id uuid, p_phone text, p_order_number text)
RETURNS TABLE(
  order_number text,
  status text,
  customer_name text,
  governorate text,
  stage text,
  review_product_slug text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    o.order_id::text,
    CASE
      WHEN o.status IN ('delivered','completed','refund_delivered') THEN 'delivered'
      WHEN o.status IN ('in_transit')                              THEN 'shipped'
      WHEN o.status IN ('confirmed','contacted')                   THEN 'confirmed'
      ELSE 'placed'
    END,
    o.customer_name,
    o.governorate_code,
    CASE o.status
      WHEN 'new'              THEN 'placed'
      WHEN 'pending_checkout' THEN 'placed'
      WHEN 'contacted'        THEN 'awaiting_confirmation'
      WHEN 'confirmed'        THEN 'confirmed'
      WHEN 'in_transit'       THEN 'shipped'
      WHEN 'delivered'        THEN 'delivered'
      WHEN 'completed'        THEN 'delivered'
      WHEN 'no_response'      THEN 'no_response'
      WHEN 'suspended'        THEN 'on_hold'
      WHEN 'cancelled'        THEN 'cancelled'
      WHEN 'rejected'         THEN 'cancelled'
      WHEN 'return_pending'   THEN 'returning'
      WHEN 'refund_delivered' THEN 'refunded'
      ELSE 'placed'
    END,
    (
      SELECT p.slug FROM public.products p
       WHERE p.id::text = (o.items::jsonb -> 0 ->> 'product_id')
         AND p.tenant_id = o.tenant_id
         AND p.is_visible AND NOT p.is_archived
       LIMIT 1
    )
  FROM public.orders o
  JOIN public.tenants t ON t.id = o.tenant_id
  WHERE o.tenant_id = p_tenant_id
    AND o.deleted_at IS NULL
    AND t.status IN ('trial','active')
    AND btrim(coalesce(p_order_number,'')) <> ''
    AND o.order_id::text = btrim(p_order_number)
    AND length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) >= 7
    AND right(regexp_replace(o.phone, '\D', '', 'g'), 10)
      = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.lookup_order(uuid, text, text) TO anon, authenticated;
