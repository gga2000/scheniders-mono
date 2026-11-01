-- =====================================================================
-- lookup_orders_by_phone: /track by phone number alone
-- =====================================================================
-- /track used to need the order number AND the phone. Shoppers rarely keep
-- the order number, so the page now also answers a phone on its own with
-- that phone's latest orders.
--
-- What a phone alone may see is deliberately less than lookup_order shows
-- for phone + order number: the order number, the customer-facing stage,
-- when it was placed and how many pieces it holds. No name, no address, no
-- governorate, no prices. Knowing a phone number is not proof of being its
-- owner, so nothing personal beyond "this number has orders" is returned.
--
-- Stage mapping is lookup_order's, verbatim (pg_get_functiondef on
-- sduvpgqwhxragxtxztur, 2026-11-01), so both paths always name a status
-- the same way. Pending-checkout rows (an abandoned form) are not orders
-- the shopper placed and are left out.
--
-- Uses idx_orders_tenant_phone_key (tenant_id, loyalty_phone_key(phone))
-- WHERE deleted_at IS NULL. Same grants as lookup_order after
-- 20261021090300: service_role only, so the storefront route's rate limits
-- (per IP and per phone) cannot be bypassed by calling PostgREST directly.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.lookup_orders_by_phone(
  p_tenant_id uuid,
  p_phone text
)
RETURNS TABLE(order_number text, stage text, placed_at timestamptz, item_count integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    o.order_id::text,
    CASE o.status
      WHEN 'new'              THEN 'placed'
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
    o.created_at,
    COALESCE((
      SELECT sum(GREATEST(COALESCE((i ->> 'quantity')::int, 1), 0))::int
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(o.items::jsonb) = 'array' THEN o.items::jsonb ELSE '[]'::jsonb END
        ) AS i
    ), 0)
  FROM public.orders o
  JOIN public.tenants t ON t.id = o.tenant_id
  WHERE o.tenant_id = p_tenant_id
    AND o.deleted_at IS NULL
    AND o.status <> 'pending_checkout'
    AND t.status IN ('trial', 'active')
    AND public.loyalty_phone_key(p_phone) IS NOT NULL
    AND public.loyalty_phone_key(o.phone) = public.loyalty_phone_key(p_phone)
  ORDER BY o.created_at DESC
  LIMIT 5;
$function$;

REVOKE ALL ON FUNCTION public.lookup_orders_by_phone(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_orders_by_phone(uuid, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_orders_by_phone(uuid, text) TO service_role;
