-- Mirror of packages/supabase/migrations/20260910150000_storefront_events.sql
CREATE TABLE IF NOT EXISTS public.storefront_events (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    visitor_key text NOT NULL,
    event_type  text NOT NULL CHECK (event_type IN ('page_view','view_product','add_to_cart','initiate_checkout','purchase')),
    page_id     text,
    product_id  uuid,
    order_id    uuid,
    value_iqd   integer,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storefront_events_tenant_created
    ON public.storefront_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_storefront_events_tenant_type_product
    ON public.storefront_events (tenant_id, event_type, product_id);

ALTER TABLE public.storefront_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storefront_events_member_select ON public.storefront_events;
CREATE POLICY storefront_events_member_select ON public.storefront_events
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
REVOKE ALL ON public.storefront_events FROM anon;

CREATE OR REPLACE FUNCTION public.storefront_funnel(_tenant_id uuid, _from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH ev AS (
    SELECT * FROM public.storefront_events
    WHERE tenant_id = _tenant_id AND created_at >= _from AND created_at < _to
  ),
  stages AS (
    SELECT
      COUNT(DISTINCT visitor_key) FILTER (WHERE event_type = 'page_view')         AS visitors,
      COUNT(DISTINCT visitor_key) FILTER (WHERE event_type = 'view_product')      AS product_viewers,
      COUNT(DISTINCT visitor_key) FILTER (WHERE event_type = 'add_to_cart')       AS cart_adders,
      COUNT(DISTINCT visitor_key) FILTER (WHERE event_type = 'initiate_checkout') AS checkout_starters,
      COUNT(DISTINCT visitor_key) FILTER (WHERE event_type = 'purchase')          AS buyers,
      COUNT(*) FILTER (WHERE event_type = 'page_view')                            AS page_views,
      COUNT(*) FILTER (WHERE event_type = 'purchase')                             AS purchases,
      COALESCE(SUM(value_iqd) FILTER (WHERE event_type = 'purchase'), 0)          AS revenue_iqd
    FROM ev
  ),
  days AS (
    SELECT jsonb_agg(jsonb_build_object('day', d.day, 'visitors', d.visitors, 'purchases', d.purchases) ORDER BY d.day) AS series
    FROM (
      SELECT date_trunc('day', created_at)::date AS day,
             COUNT(DISTINCT visitor_key) FILTER (WHERE event_type = 'page_view') AS visitors,
             COUNT(*) FILTER (WHERE event_type = 'purchase') AS purchases
      FROM ev GROUP BY 1
    ) d
  ),
  products AS (
    SELECT jsonb_agg(jsonb_build_object('product_id', p.product_id, 'name', p.name, 'viewers', p.viewers, 'buyers', p.buyers) ORDER BY p.viewers DESC) AS top
    FROM (
      SELECT v.product_id, pr.name,
             COUNT(DISTINCT v.visitor_key) AS viewers,
             COUNT(DISTINCT b.visitor_key) AS buyers
      FROM ev v
      LEFT JOIN ev b ON b.event_type = 'purchase' AND b.product_id = v.product_id AND b.visitor_key = v.visitor_key
      LEFT JOIN public.products pr ON pr.id = v.product_id
      WHERE v.event_type = 'view_product' AND v.product_id IS NOT NULL
      GROUP BY v.product_id, pr.name
      ORDER BY viewers DESC
      LIMIT 8
    ) p
  )
  SELECT jsonb_build_object(
    'visitors', s.visitors, 'product_viewers', s.product_viewers, 'cart_adders', s.cart_adders,
    'checkout_starters', s.checkout_starters, 'buyers', s.buyers,
    'page_views', s.page_views, 'purchases', s.purchases, 'revenue_iqd', s.revenue_iqd,
    'series', COALESCE(d.series, '[]'::jsonb), 'top_products', COALESCE(p.top, '[]'::jsonb)
  )
  FROM stages s CROSS JOIN days d CROSS JOIN products p;
$$;

REVOKE EXECUTE ON FUNCTION public.storefront_funnel(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storefront_funnel(uuid, timestamptz, timestamptz) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';;
