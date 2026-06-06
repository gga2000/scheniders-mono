-- Public order tracking: lets an anonymous customer look up THEIR order by
-- (order number + phone) without any broad read access to `orders`. Returns
-- only safe fields, only for an exact match within an active/trial tenant,
-- and only when a real phone is supplied (not enumerable by order number alone).
CREATE OR REPLACE FUNCTION public.lookup_order(
  p_tenant_id uuid, p_phone text, p_order_number text
)
RETURNS TABLE(order_number text, status text, customer_name text, governorate text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.order_id::text,
    CASE
      WHEN o.status IN ('delivered','completed','refund_delivered') THEN 'delivered'
      WHEN o.status IN ('in_transit')                              THEN 'shipped'
      WHEN o.status IN ('confirmed','contacted')                   THEN 'confirmed'
      ELSE 'placed'
    END,
    o.customer_name,
    o.governorate_code
  FROM public.orders o
  JOIN public.tenants t ON t.id = o.tenant_id
  WHERE o.tenant_id = p_tenant_id
    AND t.status IN ('trial','active')
    AND btrim(coalesce(p_order_number,'')) <> ''
    AND o.order_id::text = btrim(p_order_number)
    AND length(regexp_replace(coalesce(p_phone,''), '\D', '', 'g')) >= 7
    AND right(regexp_replace(o.phone, '\D', '', 'g'), 10)
      = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_order(uuid, text, text) FROM public;
GRANT  EXECUTE ON FUNCTION public.lookup_order(uuid, text, text) TO anon, authenticated;
