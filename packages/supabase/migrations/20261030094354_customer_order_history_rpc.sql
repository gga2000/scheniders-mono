-- Customer order history for the profile and drawer (R2-19), take two.
--
-- get_customer_orders (20261030094241) returned SETOF orders, but authenticated
-- may not read the cost and profit columns of orders (column grants), so every
-- call failed with "permission denied". It is revoked here and dropped by the
-- SQL-editor cleanup; get_customer_order_history replaces it and returns only
-- the columns the customer screens show. Same rules: active store only, match
-- on the normalized phone (so "07… " and 9640… shapes are found), live orders
-- only, SECURITY INVOKER so RLS still applies.

REVOKE ALL ON FUNCTION public.get_customer_orders(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_order_history(p_phone text)
RETURNS TABLE(
    id uuid, order_id text, created_at timestamptz, status text, is_return boolean,
    items jsonb, price numeric, discount_amount numeric, delivery_fee numeric,
    payment_status text, notes text, customer_name text, city text,
    governorate_code text, address_details text, secondary_phone text
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
    SELECT o.id, o.order_id, o.created_at, o.status, COALESCE(o.is_return, false),
           o.items, o.price, o.discount_amount, o.delivery_fee,
           o.payment_status, o.notes, o.customer_name, o.city,
           o.governorate_code, o.address_details, o.secondary_phone
      FROM public.orders o
     WHERE o.tenant_id = public.require_current_tenant()
       AND public.normalize_phone_for_search(o.phone) = public.normalize_phone_for_search(
               translate(COALESCE(p_phone, ''), '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789'))
       AND o.deleted_at IS NULL
       AND NOT COALESCE(o.is_archived, false)
       AND NOT COALESCE(o.is_test, false)
       AND o.status <> 'pending_checkout';
$function$;

REVOKE ALL ON FUNCTION public.get_customer_order_history(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_order_history(text) TO authenticated;