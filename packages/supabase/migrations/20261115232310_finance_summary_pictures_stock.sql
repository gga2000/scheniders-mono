-- Finances summary, round 2: product pictures, stock on the shelf, and stock
-- purchases kept out of profit.
--
-- 1. Each product row carries its picture (image_url) for the ranked list.
-- 2. `stock`: the pieces on the shelf now and what they cost, for products that
--    are physical and not archived. Pieces with no cost on file are counted in
--    `pieces` but not in `cost_value`; `missing_cost_products` says how many
--    products that is.
-- 3. Owner's rule (2026-11-15): an expense in the `product_cost` category is a
--    stock purchase. It is cash out, not a cost of the period, because the
--    goods are already counted as product cost on the day they sell. It stays
--    in `expenses` so the page can show it, and leaves each day's `expenses`.

CREATE OR REPLACE FUNCTION public.finance_summary_core(_tenant_id uuid, _from date, _to date)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH w AS (
    SELECT LEAST(_from, _to) AS d_from,
           GREATEST(_from, _to) AS d_to,
           (LEAST(_from, _to)::timestamp AT TIME ZONE 'Asia/Baghdad') AS ts_from,
           ((GREATEST(_from, _to) + 1)::timestamp AT TIME ZONE 'Asia/Baghdad') AS ts_to
  ),
  sold AS (
    SELECT o.id, COALESCE(o.price, 0) AS price, o.items, o.item_unit_costs,
           (COALESCE(o.delivered_at, o.completed_at) AT TIME ZONE 'Asia/Baghdad')::date AS day
    FROM public.orders o, w
    WHERE o.tenant_id = _tenant_id
      AND o.deleted_at IS NULL
      AND COALESCE(o.is_return, false) = false
      AND COALESCE(o.is_test, false) = false
      AND o.take_kind IS NULL
      AND o.status IN ('delivered', 'completed')
      AND COALESCE(o.delivered_at, o.completed_at) >= w.ts_from
      AND COALESCE(o.delivered_at, o.completed_at) < w.ts_to
  ),
  lines AS (
    SELECT s.id, s.day, s.price AS order_price,
           CASE WHEN it.item->>'quantity' ~ '^[0-9]+(\.[0-9]+)?$'
                THEN round((it.item->>'quantity')::numeric)::int ELSE 0 END AS qty,
           CASE WHEN it.item->>'price' ~ '^-?[0-9]+(\.[0-9]+)?$'
                THEN (it.item->>'price')::numeric ELSE 0 END AS unit_price,
           NULLIF(btrim(it.item->>'name'), '') AS name,
           NULLIF(it.item->>'product_id', '') AS product_id,
           NULLIF(it.item->>'variant_id', '') AS variant_id,
           NULLIF(lower(btrim(it.item->>'sku')), '') AS sku,
           s.item_unit_costs[it.ord] AS frozen
    FROM sold s
    CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(s.items) = 'array' THEN s.items ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS it(item, ord)
  ),
  costed AS (
    SELECT l.id, l.day, l.qty,
           -- The line's share of what the customer paid for the order, so an
           -- order discount is spread over its lines and products add up to sales.
           CASE WHEN sum(l.unit_price * l.qty) OVER (PARTITION BY l.id) > 0
                THEN l.order_price * (l.unit_price * l.qty) / sum(l.unit_price * l.qty) OVER (PARTITION BY l.id)
                ELSE l.order_price * l.qty / sum(l.qty) OVER (PARTITION BY l.id) END AS line_revenue,
           COALESCE(NULLIF(l.frozen, 0), NULLIF(v.cost, 0), NULLIF(p.cost, 0)) AS unit_cost,
           COALESCE(p.id::text, 'name:' || lower(COALESCE(l.name, ''))) AS pkey,
           COALESCE(p.name, l.name, '') AS pname,
           p.image_url AS pimage
    FROM lines l
    LEFT JOIN LATERAL (
        SELECT pr.id, pr.name, pr.cost, pr.image_url
        FROM public.products pr
        WHERE pr.tenant_id = _tenant_id
          AND (pr.id::text = l.product_id
               OR (l.product_id IS NULL AND l.sku IS NOT NULL AND lower(btrim(pr.sku)) = l.sku))
        ORDER BY (pr.id::text = l.product_id) DESC NULLS LAST
        LIMIT 1
    ) p ON true
    LEFT JOIN public.product_variants v
           ON v.tenant_id = _tenant_id AND v.id::text = l.variant_id
    WHERE l.qty > 0
  ),
  order_cost AS (
    SELECT c.id,
           COALESCE(sum(c.unit_cost * c.qty), 0) AS cost,
           COALESCE(sum(c.qty) FILTER (WHERE c.unit_cost IS NULL), 0) AS missing_units,
           sum(c.qty) AS units
    FROM costed c
    GROUP BY c.id
  ),
  sold_day AS (
    SELECT s.day, count(*) AS orders, sum(s.price) AS revenue,
           COALESCE(sum(oc.cost), 0) AS product_cost
    FROM sold s LEFT JOIN order_cost oc ON oc.id = s.id
    GROUP BY s.day
  ),
  prime_fee AS (
    SELECT s.day, COALESCE(sum(ps.shipment_charge), 0) AS fee, count(*) AS parcels
    FROM sold s
    JOIN public.prime_shipments ps ON ps.order_id = s.id AND ps.tenant_id = _tenant_id
    -- A parcel that came back is counted once, under prime_returned.
    WHERE ps.shipment_status IS DISTINCT FROM 'FAILED_DELIVER_RETURNED_TO_SENDER'
    GROUP BY s.day
  ),
  refunds AS (
    SELECT (o.refund_paid_at AT TIME ZONE 'Asia/Baghdad')::date AS day,
           abs(COALESCE(o.price, 0)) AS amount
    FROM public.orders o, w
    WHERE o.tenant_id = _tenant_id
      AND o.deleted_at IS NULL
      AND COALESCE(o.is_test, false) = false
      AND o.status = 'refund_delivered'
      AND o.refund_paid_at >= w.ts_from
      AND o.refund_paid_at < w.ts_to
  ),
  refund_day AS (
    SELECT day, count(*) AS n, sum(amount) AS amount FROM refunds GROUP BY day
  ),
  exp AS (
    SELECT e.expense_date AS day, e.category, COALESCE(e.amount, 0) AS amount
    FROM public.expenses e, w
    WHERE e.tenant_id = _tenant_id AND e.expense_date BETWEEN w.d_from AND w.d_to
  ),
  exp_day AS (
    SELECT day, sum(amount) AS amount FROM exp
    -- Buying stock is not a cost of the period: the goods are counted when they sell.
    WHERE category IS DISTINCT FROM 'product_cost'
    GROUP BY day
  ),
  pay AS (
    SELECT (pr.paid_at AT TIME ZONE 'Asia/Baghdad')::date AS day,
           COALESCE(pr.amount_paid, pr.net_salary, 0) AS amount
    FROM public.payroll_records pr, w
    WHERE pr.tenant_id = _tenant_id AND pr.status = 'paid'
      AND pr.paid_at >= w.ts_from AND pr.paid_at < w.ts_to
  ),
  pay_day AS (
    SELECT day, sum(amount) AS amount FROM pay GROUP BY day
  ),
  transit AS (
    SELECT o.id, COALESCE(o.price, 0) AS price,
           COALESCE(
             (SELECT max(h.changed_at) FROM public.order_status_history h
               WHERE h.order_id = o.id AND h.to_status = 'in_transit'
                 AND h.from_status IS DISTINCT FROM h.to_status),
             o.updated_at) AS since
    FROM public.orders o
    WHERE o.tenant_id = _tenant_id
      AND o.deleted_at IS NULL
      AND o.status = 'in_transit'
      AND COALESCE(o.is_return, false) = false
      AND COALESCE(o.is_test, false) = false
      AND o.take_kind IS NULL
  ),
  prime_held AS (
    SELECT count(*) AS parcels,
           COALESCE(sum(ps.receipt_amount_iqd), 0) AS collected,
           COALESCE(sum(ps.shipment_charge), 0) AS fee
    FROM public.prime_shipments ps
    WHERE ps.tenant_id = _tenant_id
      AND ps.payment_id IS NULL
      AND ps.cancelled_at IS NULL
      AND ps.shipment_status IN ('DELIVERED', 'PART_DELIVERED', 'DELIVERED_CHANGE_PRICE')
  ),
  prime_returned AS (
    SELECT (ps.status_changed_at AT TIME ZONE 'Asia/Baghdad')::date AS day,
           count(*) AS parcels, COALESCE(sum(ps.shipment_charge), 0) AS fee
    FROM public.prime_shipments ps, w
    WHERE ps.tenant_id = _tenant_id
      AND ps.shipment_status = 'FAILED_DELIVER_RETURNED_TO_SENDER'
      AND ps.status_changed_at >= w.ts_from AND ps.status_changed_at < w.ts_to
    GROUP BY 1
  ),
  refused AS (
    SELECT count(*) AS n, COALESCE(sum(o.price), 0) AS value
    FROM public.orders o, w
    WHERE o.tenant_id = _tenant_id
      AND o.deleted_at IS NULL
      AND o.status = 'rejected'
      AND COALESCE(o.is_return, false) = false
      AND COALESCE(o.is_test, false) = false
      AND EXISTS (
        SELECT 1 FROM public.order_status_history h
         WHERE h.order_id = o.id AND h.to_status = 'rejected'
           AND h.from_status IS DISTINCT FROM h.to_status
           AND h.changed_at >= w.ts_from AND h.changed_at < w.ts_to)
  ),
  stock AS (
    SELECT COALESCE(sum(s.pieces), 0) AS pieces,
           COALESCE(sum(s.pieces) FILTER (WHERE s.unit_cost IS NOT NULL), 0) AS costed_pieces,
           COALESCE(sum(s.pieces * s.unit_cost), 0) AS cost_value,
           count(DISTINCT s.product_id) FILTER (WHERE s.unit_cost IS NULL AND s.pieces > 0) AS missing_cost_products
    FROM (
      -- A product with variants keeps its pieces on the variants.
      SELECT pr.id AS product_id,
             GREATEST(CASE WHEN v.id IS NOT NULL THEN COALESCE(v.stock_quantity, 0)
                           ELSE COALESCE(pr.stock_quantity, 0) END, 0) AS pieces,
             COALESCE(NULLIF(v.cost, 0), NULLIF(pr.cost, 0)) AS unit_cost
      FROM public.products pr
      LEFT JOIN public.product_variants v ON v.product_id = pr.id AND v.tenant_id = _tenant_id
      WHERE pr.tenant_id = _tenant_id
        AND COALESCE(pr.is_archived, false) = false
        AND pr.product_type = 'physical'
    ) s
  ),
  days AS (
    SELECT d::date AS day FROM w, generate_series(w.d_from::timestamp, w.d_to::timestamp, interval '1 day') d
  ),
  products AS (
    SELECT c.pkey, max(c.pname) AS name, max(c.pimage) AS image_url, sum(c.qty) AS units,
           round(sum(c.line_revenue)) AS revenue,
           COALESCE(sum(c.unit_cost * c.qty), 0) AS cost,
           COALESCE(sum(c.qty) FILTER (WHERE c.unit_cost IS NULL), 0) AS missing_units
    FROM costed c
    GROUP BY c.pkey
  )
  SELECT jsonb_build_object(
    'from', (SELECT d_from FROM w),
    'to', (SELECT d_to FROM w),
    'sales', jsonb_build_object(
        'orders', (SELECT count(*) FROM sold),
        'revenue', (SELECT COALESCE(sum(price), 0) FROM sold),
        'units', (SELECT COALESCE(sum(units), 0) FROM order_cost),
        'product_cost', (SELECT COALESCE(sum(cost), 0) FROM order_cost),
        'missing_cost_units', (SELECT COALESCE(sum(missing_units), 0) FROM order_cost)),
    'refunds', jsonb_build_object(
        'count', (SELECT count(*) FROM refunds),
        'amount', (SELECT COALESCE(sum(amount), 0) FROM refunds)),
    'expenses', COALESCE((SELECT jsonb_agg(jsonb_build_object('category', category, 'amount', amount) ORDER BY amount DESC)
                            FROM (SELECT category, sum(amount) AS amount FROM exp GROUP BY category) x), '[]'::jsonb),
    'salaries_paid', (SELECT COALESCE(sum(amount), 0) FROM pay),
    'courier', jsonb_build_object(
        'prime_fee', (SELECT COALESCE(sum(fee), 0) FROM prime_fee),
        'prime_parcels', (SELECT COALESCE(sum(parcels), 0) FROM prime_fee)),
    'cash', jsonb_build_object(
        'in_transit', (SELECT jsonb_build_object('count', count(*), 'amount', COALESCE(sum(price), 0)) FROM transit),
        'stuck', (SELECT jsonb_build_object('count', count(*), 'amount', COALESCE(sum(price), 0))
                    FROM transit WHERE since <= now() - interval '15 days'),
        'prime_linked', EXISTS (SELECT 1 FROM public.prime_connections pc WHERE pc.tenant_id = _tenant_id),
        'prime_held', (SELECT jsonb_build_object('parcels', parcels, 'collected', collected, 'fee', fee) FROM prime_held)),
    'failed', jsonb_build_object(
        'refused_orders', (SELECT n FROM refused),
        'refused_value', (SELECT value FROM refused),
        'prime_returned_parcels', (SELECT COALESCE(sum(parcels), 0) FROM prime_returned),
        'prime_returned_fee', (SELECT COALESCE(sum(fee), 0) FROM prime_returned)),
    'stock', (SELECT jsonb_build_object('pieces', pieces, 'costed_pieces', costed_pieces,
                'cost_value', cost_value, 'missing_cost_products', missing_cost_products) FROM stock),
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'day', d.day,
                'orders', COALESCE(sd.orders, 0),
                'revenue', COALESCE(sd.revenue, 0),
                'product_cost', COALESCE(sd.product_cost, 0),
                'courier', COALESCE(pf.fee, 0) + COALESCE(prt.fee, 0),
                'refunds', COALESCE(rd.amount, 0),
                'expenses', COALESCE(ed.amount, 0),
                'salaries', COALESCE(pd.amount, 0)) ORDER BY d.day)
              FROM days d
              LEFT JOIN sold_day sd ON sd.day = d.day
              LEFT JOIN prime_fee pf ON pf.day = d.day
              LEFT JOIN prime_returned prt ON prt.day = d.day
              LEFT JOIN refund_day rd ON rd.day = d.day
              LEFT JOIN exp_day ed ON ed.day = d.day
              LEFT JOIN pay_day pd ON pd.day = d.day), '[]'::jsonb),
    'products', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'key', p.pkey, 'name', p.name, 'image_url', p.image_url, 'units', p.units, 'revenue', p.revenue,
                'cost', p.cost, 'missing_units', p.missing_units) ORDER BY p.revenue DESC, p.pkey)
              FROM (SELECT * FROM products ORDER BY revenue DESC, pkey LIMIT 50) p), '[]'::jsonb)
  );
$function$;

REVOKE ALL ON FUNCTION public.finance_summary_core(uuid, date, date) FROM PUBLIC, anon, authenticated;