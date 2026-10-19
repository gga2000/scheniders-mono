CREATE OR REPLACE FUNCTION public.search_orders(p_term text, p_limit int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  order_id text,
  customer_name text,
  phone text,
  city text,
  status text,
  price numeric,
  governorate_code text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT o.id, o.order_id, o.customer_name, o.phone,
         o.city, o.status, o.price, o.governorate_code, o.created_at
  FROM public.orders o
  WHERE o.is_archived = false
    AND o.deleted_at IS NULL
    AND o.status <> 'pending_checkout'
    AND length(btrim(p_term)) >= 2
    AND (
      o.order_id      ILIKE '%' || btrim(p_term) || '%'
      OR o.customer_name ILIKE '%' || btrim(p_term) || '%'
      OR o.phone         ILIKE '%' || btrim(p_term) || '%'
    )
  ORDER BY o.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
$$;

REVOKE ALL ON FUNCTION public.search_orders(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_orders(text, int) TO authenticated;;
