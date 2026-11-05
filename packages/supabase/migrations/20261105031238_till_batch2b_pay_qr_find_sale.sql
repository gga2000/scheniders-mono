-- Till batch 2b: each shop's FIB / ZainCash payment QR, and finding a past sale from its receipt QR.

ALTER TABLE public.shops
    ADD COLUMN IF NOT EXISTS fib_qr_url text,
    ADD COLUMN IF NOT EXISTS zaincash_qr_url text;

ALTER TABLE public.shops
    ADD CONSTRAINT shops_fib_qr_url_https CHECK (fib_qr_url IS NULL OR (fib_qr_url ~ '^https://' AND length(fib_qr_url) <= 500)),
    ADD CONSTRAINT shops_zaincash_qr_url_https CHECK (zaincash_qr_url IS NULL OR (zaincash_qr_url ~ '^https://' AND length(zaincash_qr_url) <= 500));

-- One till sale of this store by its number (the receipt QR), from any of the store's shops and any day.
CREATE OR REPLACE FUNCTION public.till_find_sale(p_session_id uuid, p_order_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    s public.till_sessions%ROWTYPE;
    v jsonb;
BEGIN
    s := public.till_live_session(p_session_id);
    IF p_order_id IS NULL OR p_order_id !~ '^[0-9]{6,20}$' THEN
        RETURN NULL;
    END IF;
    SELECT jsonb_build_object(
             'id', o.id,
             'order_id', o.order_id,
             'created_at', o.created_at,
             'total', o.price,
             'discount', COALESCE(o.discount_amount, 0),
             'customer_name', NULLIF(o.customer_name, ''),
             'phone', NULLIF(o.phone, ''),
             'items', CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END,
             'cashier', COALESCE(NULLIF(tm.display_name, ''), ''),
             'shop_id', o.shop_id,
             'payments', COALESCE((
                 SELECT jsonb_agg(jsonb_build_object('method', p.method, 'amount', p.amount, 'tendered', p.tendered) ORDER BY p.created_at)
                   FROM public.order_payments p WHERE p.order_id = o.id AND p.tenant_id = s.tenant_id
             ), '[]'::jsonb)
           ) INTO v
      FROM public.orders o
      LEFT JOIN public.user_profiles tm ON tm.id = o.entered_by
     WHERE o.tenant_id = s.tenant_id AND o.order_id = p_order_id
       AND o.is_shop_order AND o.shop_id IS NOT NULL AND o.deleted_at IS NULL;
    RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.till_find_sale(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.till_find_sale(uuid, text) TO authenticated;
