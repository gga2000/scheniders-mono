-- Finances summary: name the prepaid orders a courier statement listed.
--
-- cash.statement_orders gains kind 'prepaid': each prepaid order a statement
-- in the period listed, with the net the statement gave it (usually minus the
-- delivery fee), so the shop can open them and check an odd amount.

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
           (COALESCE(o.delivered_at, o.completed_at) AT TIME ZONE 'Asia/Baghdad')::date AS day,
           -- The customer paid the shop before delivery (a transfer): the courier collects nothing.
           COALESCE(o.payment_status = 'prepaid', false) AS prepaid
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
  file_rows AS (
    -- One row for each order named in a courier payment file the shop confirmed: the newest file wins.
    SELECT DISTINCT ON (i.order_id) i.order_id, COALESCE(i.pdf_delivery_fee, 0) AS fee
    FROM public.delivery_import_items i
    JOIN public.delivery_imports di ON di.id = i.import_id
    WHERE di.tenant_id = _tenant_id
      AND di.status IN ('confirmed', 'completed')
      AND i.order_id IS NOT NULL
    ORDER BY i.order_id, di.created_at DESC, i.id
  ),
  file_fee AS (
    -- The fee the courier kept before paying the shop, on the order's delivery day.
    -- An order that travelled as a Prime parcel is charged under prime_fee, once.
    SELECT s.day, sum(fr.fee) AS fee, count(*) AS orders
    FROM sold s
    JOIN file_rows fr ON fr.order_id = s.id
    WHERE fr.fee > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.prime_shipments ps
         WHERE ps.order_id = s.id AND ps.tenant_id = _tenant_id)
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
             o.updated_at) AS since,
           ps.shipment_status AS prime_status
    FROM public.orders o
    LEFT JOIN public.prime_shipments ps
           ON ps.order_id = o.id AND ps.tenant_id = _tenant_id AND ps.cancelled_at IS NULL
    WHERE o.tenant_id = _tenant_id
      AND o.deleted_at IS NULL
      AND o.status = 'in_transit'
      AND COALESCE(o.is_return, false) = false
      AND COALESCE(o.is_test, false) = false
      AND o.take_kind IS NULL
  ),
  road AS (
    -- Still out for delivery. A parcel Prime is bringing back is goods, not money,
    -- and one Prime has delivered is counted under prime_held.
    SELECT t.id, t.price, t.since
    FROM transit t
    WHERE t.prime_status IS NULL
       OR t.prime_status NOT IN ('FAILED_DELIVER_RETURNED_TO_SENDER', 'DELIVERED', 'PART_DELIVERED', 'DELIVERED_CHANGE_PRICE')
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
    SELECT count(*) AS n, COALESCE(sum(x.price), 0) AS value
    FROM (
      -- Marked refused by the shop in the period. A parcel Prime brought back is counted below, once.
      SELECT o.id, COALESCE(o.price, 0) AS price
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
        AND NOT EXISTS (
          SELECT 1 FROM public.prime_shipments ps
           WHERE ps.order_id = o.id AND ps.tenant_id = _tenant_id
             AND ps.shipment_status = 'FAILED_DELIVER_RETURNED_TO_SENDER')
      UNION ALL
      -- Refused at the door on Prime: counted the day Prime marked it, whether the shop has the parcel back or not.
      SELECT o.id, COALESCE(o.price, 0) AS price
      FROM public.prime_shipments ps
      JOIN public.orders o ON o.id = ps.order_id AND o.tenant_id = _tenant_id, w
      WHERE ps.tenant_id = _tenant_id
        AND ps.shipment_status = 'FAILED_DELIVER_RETURNED_TO_SENDER'
        AND ps.status_changed_at >= w.ts_from AND ps.status_changed_at < w.ts_to
        AND o.deleted_at IS NULL
        AND o.status NOT IN ('delivered', 'completed')
        AND COALESCE(o.is_return, false) = false
        AND COALESCE(o.is_test, false) = false
    ) x
  ),
  shelf AS (
    -- A product with variants keeps its pieces on the variants.
    SELECT pr.id AS product_id, pr.name,
           GREATEST(CASE WHEN v.id IS NOT NULL THEN COALESCE(v.stock_quantity, 0)
                         ELSE COALESCE(pr.stock_quantity, 0) END, 0) AS pieces,
           COALESCE(NULLIF(v.cost, 0), NULLIF(pr.cost, 0)) AS unit_cost
    FROM public.products pr
    LEFT JOIN public.product_variants v ON v.product_id = pr.id AND v.tenant_id = _tenant_id
    WHERE pr.tenant_id = _tenant_id
      AND COALESCE(pr.is_archived, false) = false
      AND pr.product_type = 'physical'
  ),
  stock AS (
    SELECT COALESCE(sum(s.pieces), 0) AS pieces,
           COALESCE(sum(s.pieces) FILTER (WHERE s.unit_cost IS NOT NULL), 0) AS costed_pieces,
           COALESCE(sum(s.pieces * s.unit_cost), 0) AS cost_value,
           count(DISTINCT s.product_id) FILTER (WHERE s.unit_cost IS NULL AND s.pieces > 0) AS missing_cost_products
    FROM shelf s
  ),
  stock_top AS (
    -- The three products with the most money on the shelf, at cost.
    SELECT s.product_id, max(s.name) AS name, sum(s.pieces) AS pieces,
           sum(s.pieces * s.unit_cost) AS value
    FROM shelf s
    WHERE s.unit_cost IS NOT NULL AND s.pieces > 0
    GROUP BY s.product_id
    ORDER BY value DESC, s.product_id
    LIMIT 3
  ),
  payout_files AS (
    -- One row for each courier payment. The same file uploaded twice keeps one row.
    SELECT DISTINCT ON (COALESCE(NULLIF(btrim(di.receipt_number), ''), di.id::text))
           di.id AS import_id,
           COALESCE(di.actual_amount_received, di.total_amount, 0) AS amount,
           (di.payment_date AT TIME ZONE 'Asia/Baghdad')::date AS day
    FROM public.delivery_imports di, w
    WHERE di.tenant_id = _tenant_id
      AND di.status IN ('confirmed', 'completed')
      AND di.payment_date >= w.ts_from AND di.payment_date < w.ts_to
    ORDER BY COALESCE(NULLIF(btrim(di.receipt_number), ''), di.id::text),
             (di.actual_amount_received IS NULL), di.created_at
  ),
  payouts AS (
    SELECT count(*) AS payments,
           COALESCE(sum(f.amount), 0) AS amount,
           max(f.day) AS last_day,
           COALESCE(sum(f.amount) FILTER (WHERE f.day = (SELECT max(day) FROM payout_files)), 0) AS last_amount
    FROM payout_files f
  ),
  paid_ids AS (
    -- Orders named in a courier payment file the shop confirmed, or in a Prime payment.
    SELECT i.order_id AS id
    FROM public.delivery_import_items i
    JOIN public.delivery_imports di ON di.id = i.import_id
    WHERE di.tenant_id = _tenant_id
      AND di.status IN ('confirmed', 'completed')
      AND i.order_id IS NOT NULL
    UNION
    SELECT ps.order_id
    FROM public.prime_shipments ps
    WHERE ps.tenant_id = _tenant_id AND ps.payment_id IS NOT NULL
  ),
  sold_fee AS (
    -- Each delivered order's delivery fee: Prime's fee on its parcel, else the
    -- courier's fee in its payment file, exactly as prime_fee and file_fee count them.
    SELECT s.id, s.price,
           COALESCE((SELECT sum(COALESCE(ps.shipment_charge, 0))
                       FROM public.prime_shipments ps
                      WHERE ps.order_id = s.id AND ps.tenant_id = _tenant_id
                        AND ps.shipment_status IS DISTINCT FROM 'FAILED_DELIVER_RETURNED_TO_SENDER'), 0)
         + CASE WHEN NOT EXISTS (SELECT 1 FROM public.prime_shipments ps
                                  WHERE ps.order_id = s.id AND ps.tenant_id = _tenant_id)
                THEN GREATEST(COALESCE(fr.fee, 0), 0) ELSE 0 END AS fee,
           -- Named in a courier payment file or a Prime payment.
           s.id IN (SELECT id FROM paid_ids) AS settled,
           s.prepaid,
           -- Paid to the shop: by the courier or Prime, or by the customer up front.
           (s.prepaid OR s.id IN (SELECT id FROM paid_ids)) AS paid,
           EXISTS (SELECT 1 FROM public.delivery_import_items i
                     JOIN public.delivery_imports di ON di.id = i.import_id
                    WHERE i.order_id = s.id AND di.tenant_id = _tenant_id
                      AND di.status IN ('confirmed', 'completed')
                      AND di.payment_date >= (SELECT ts_from FROM w)
                      AND di.payment_date < (SELECT ts_to FROM w)) AS file_now,
           EXISTS (SELECT 1 FROM public.delivery_import_items i
                     JOIN public.delivery_imports di ON di.id = i.import_id
                    WHERE i.order_id = s.id AND di.tenant_id = _tenant_id
                      AND di.status IN ('confirmed', 'completed')
                      AND di.payment_date < (SELECT ts_from FROM w)) AS file_before,
           EXISTS (SELECT 1 FROM public.prime_shipments ps
                    WHERE ps.order_id = s.id AND ps.tenant_id = _tenant_id
                      AND ps.payment_id IS NULL AND ps.cancelled_at IS NULL
                      AND ps.shipment_status IN ('DELIVERED', 'PART_DELIVERED', 'DELIVERED_CHANGE_PRICE')) AS with_prime
    FROM sold s
    LEFT JOIN file_rows fr ON fr.order_id = s.id
  ),
  money_split AS (
    SELECT COALESCE(sum(price - fee) FILTER (WHERE paid), 0) AS reached,
           count(*) FILTER (WHERE paid) AS reached_orders,
           COALESCE(sum(fee), 0) AS fee,
           COALESCE(sum(price - fee) FILTER (WHERE NOT paid), 0) AS unpaid,
           count(*) FILTER (WHERE NOT paid) AS unpaid_orders,
           count(*) FILTER (WHERE NOT paid AND with_prime) AS unpaid_prime,
           -- Where "reached" came from: the customer up front (whatever a statement
           -- says about it), a courier payment dated before the period (the order
           -- was marked delivered later, on import), one dated in the period, or a
           -- later payment. The four add up to reached.
           COALESCE(sum(price - fee) FILTER (WHERE prepaid), 0) AS reached_prepaid,
           count(*) FILTER (WHERE prepaid) AS reached_prepaid_orders,
           COALESCE(sum(price - fee) FILTER (WHERE settled AND NOT prepaid AND file_before), 0) AS reached_before,
           count(*) FILTER (WHERE settled AND NOT prepaid AND file_before) AS reached_before_orders,
           COALESCE(sum(price - fee) FILTER (WHERE settled AND NOT prepaid AND NOT file_before AND file_now), 0) AS reached_now,
           COALESCE(sum(price - fee) FILTER (WHERE settled AND NOT prepaid AND NOT file_before AND NOT file_now), 0) AS reached_other
    FROM sold_fee
  ),
  stmt_items AS (
    -- The rows of the courier payments dated in the period, one file per payment.
    SELECT i.order_id, COALESCE(i.pdf_amount, 0) AS amount, COALESCE(i.pdf_net_amount, 0) AS net,
           COALESCE(o.is_return, false) AS is_return,
           -- The order exists but is not marked delivered: the courier paid for it anyway.
           (o.id IS NOT NULL AND o.deleted_at IS NULL AND NOT COALESCE(o.is_return, false)
             AND o.status NOT IN ('delivered', 'completed')) AS undelivered,
           o.order_id AS code,
           o.status
    FROM payout_files f
    JOIN public.delivery_import_items i ON i.import_id = f.import_id
    LEFT JOIN public.orders o ON o.id = i.order_id AND o.tenant_id = _tenant_id
  ),
  stmt AS (
    -- Why the payments differ from what they paid for this period's orders
    -- (reached_now): refunds the courier paid customers for the shop (and which
    -- of them the shop has not marked done), what the statements did with
    -- prepaid orders (usually only the fee taken off), orders collected at a
    -- different amount, and orders paid for that are not marked delivered.
    -- The UI shows the rest as one remainder, so the parts add up to the payments.
    SELECT COALESCE(sum(si.net) FILTER (WHERE si.is_return), 0) AS returns,
           count(*) FILTER (WHERE si.is_return) AS returns_orders,
           COALESCE(sum(si.net) FILTER (WHERE si.is_return AND si.status IS DISTINCT FROM 'refund_delivered'), 0) AS returns_open,
           count(*) FILTER (WHERE si.is_return AND si.status IS DISTINCT FROM 'refund_delivered') AS returns_open_orders,
           COALESCE(sum(si.net) FILTER (WHERE sf.prepaid), 0) AS prepaid_gap,
           count(*) FILTER (WHERE sf.prepaid) AS prepaid_orders,
           COALESCE(sum(si.amount - sf.price) FILTER (WHERE NOT sf.prepaid), 0) AS price_gap,
           count(*) FILTER (WHERE NOT sf.prepaid AND si.amount <> sf.price) AS price_gap_orders,
           COALESCE(sum(si.net) FILTER (WHERE si.undelivered), 0) AS undelivered,
           count(*) FILTER (WHERE si.undelivered) AS undelivered_orders
    FROM stmt_items si
    LEFT JOIN sold_fee sf ON sf.id = si.order_id AND NOT si.is_return AND NOT sf.file_before AND sf.file_now
  ),
  stmt_orders AS (
    -- The orders behind the statement differences the shop can act on, so the
    -- card can open each one: refunds not marked done, orders paid for but not
    -- marked delivered, orders collected at another price, and prepaid orders
    -- (what the statement did with each, usually its delivery fee). Up to 10 a kind.
    SELECT kind, id, code, amount
    FROM (
      SELECT x.*, row_number() OVER (PARTITION BY x.kind ORDER BY x.code, x.id) AS n
      FROM (
        SELECT 'refund_open' AS kind, si.order_id AS id, si.code, si.net AS amount
        FROM stmt_items si
        WHERE si.is_return AND si.status IS DISTINCT FROM 'refund_delivered'
        UNION ALL
        SELECT 'undelivered', si.order_id, si.code, si.net
        FROM stmt_items si
        WHERE si.undelivered
        UNION ALL
        SELECT 'price', si.order_id, si.code, si.amount - sf.price
        FROM stmt_items si
        JOIN sold_fee sf ON sf.id = si.order_id AND NOT si.is_return AND NOT sf.file_before AND sf.file_now
        WHERE NOT sf.prepaid AND si.amount <> sf.price
        UNION ALL
        SELECT 'prepaid', si.order_id, si.code, si.net
        FROM stmt_items si
        JOIN sold_fee sf ON sf.id = si.order_id AND NOT si.is_return AND NOT sf.file_before AND sf.file_now
        WHERE sf.prepaid
      ) x
    ) y
    WHERE n <= 10
  ),
  unpaid_list AS (
    -- The delivered orders with money still owed on them, oldest first, so the
    -- card can name them and open each one. Orders owed nothing (a free
    -- replacement) are left out. Capped: the count stays in money_split.
    SELECT o.id, o.order_id AS code, o.customer_name AS customer,
           sf.price - sf.fee AS amount, s.day, sf.with_prime AS prime
    FROM sold_fee sf
    JOIN sold s ON s.id = sf.id
    JOIN public.orders o ON o.id = sf.id AND o.tenant_id = _tenant_id
    WHERE NOT sf.paid AND sf.price - sf.fee > 0
    ORDER BY s.day, o.id
    LIMIT 20
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
        'missing_cost_units', (SELECT COALESCE(sum(missing_units), 0) FROM order_cost),
        'paid_orders', (SELECT count(*) FROM sold s WHERE s.id IN (SELECT id FROM paid_ids))),
    'refunds', jsonb_build_object(
        'count', (SELECT count(*) FROM refunds),
        'amount', (SELECT COALESCE(sum(amount), 0) FROM refunds)),
    'expenses', COALESCE((SELECT jsonb_agg(jsonb_build_object('category', category, 'amount', amount) ORDER BY amount DESC)
                            FROM (SELECT category, sum(amount) AS amount FROM exp GROUP BY category) x), '[]'::jsonb),
    'salaries_paid', (SELECT COALESCE(sum(amount), 0) FROM pay),
    'courier', jsonb_build_object(
        'prime_fee', (SELECT COALESCE(sum(fee), 0) FROM prime_fee),
        'prime_parcels', (SELECT COALESCE(sum(parcels), 0) FROM prime_fee),
        'file_fee', (SELECT COALESCE(sum(fee), 0) FROM file_fee),
        'file_orders', (SELECT COALESCE(sum(orders), 0) FROM file_fee)),
    'cash', jsonb_build_object(
        'in_transit', (SELECT jsonb_build_object('count', count(*), 'amount', COALESCE(sum(price), 0)) FROM road),
        'stuck', (SELECT jsonb_build_object('count', count(*), 'amount', COALESCE(sum(price), 0))
                    FROM road WHERE since <= now() - interval '15 days'),
        'returning', (SELECT jsonb_build_object('count', count(*), 'amount', COALESCE(sum(price), 0))
                        FROM transit WHERE prime_status = 'FAILED_DELIVER_RETURNED_TO_SENDER'),
        'prime_linked', EXISTS (SELECT 1 FROM public.prime_connections pc WHERE pc.tenant_id = _tenant_id),
        'prime_held', (SELECT jsonb_build_object('parcels', parcels, 'collected', collected, 'fee', fee) FROM prime_held),
        'reached', (SELECT jsonb_build_object('payments', payments, 'amount', amount,
                      'last_day', last_day, 'last_amount', last_amount) FROM payouts),
        'split', (SELECT jsonb_build_object('reached', reached, 'reached_orders', reached_orders, 'fee', fee,
                    'unpaid', unpaid, 'unpaid_orders', unpaid_orders, 'unpaid_prime', unpaid_prime,
                    'reached_before', reached_before, 'reached_before_orders', reached_before_orders,
                    'reached_now', reached_now, 'reached_other', reached_other,
                    'reached_prepaid', reached_prepaid, 'reached_prepaid_orders', reached_prepaid_orders) FROM money_split),
        'statement', (SELECT jsonb_build_object('returns', returns, 'returns_orders', returns_orders,
                    'returns_open', returns_open, 'returns_open_orders', returns_open_orders,
                    'prepaid_gap', prepaid_gap, 'prepaid_orders', prepaid_orders,
                    'price_gap', price_gap, 'price_gap_orders', price_gap_orders,
                    'undelivered', undelivered, 'undelivered_orders', undelivered_orders) FROM stmt),
        'statement_orders', COALESCE((SELECT jsonb_agg(jsonb_build_object('kind', d.kind, 'id', d.id, 'code', d.code, 'amount', d.amount)
                          ORDER BY d.kind, d.code, d.id) FROM stmt_orders d), '[]'::jsonb),
        'unpaid_list', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', u.id, 'code', u.code, 'customer', u.customer,
                          'amount', u.amount, 'day', u.day, 'prime', u.prime) ORDER BY u.day, u.id)
                        FROM unpaid_list u), '[]'::jsonb)),
    'failed', jsonb_build_object(
        'refused_orders', (SELECT n FROM refused),
        'refused_value', (SELECT value FROM refused),
        'prime_returned_parcels', (SELECT COALESCE(sum(parcels), 0) FROM prime_returned),
        'prime_returned_fee', (SELECT COALESCE(sum(fee), 0) FROM prime_returned)),
    'stock', (SELECT jsonb_build_object('pieces', pieces, 'costed_pieces', costed_pieces,
                'cost_value', cost_value, 'missing_cost_products', missing_cost_products,
                'top', COALESCE((SELECT jsonb_agg(jsonb_build_object('key', t.product_id, 'name', t.name,
                          'pieces', t.pieces, 'value', t.value) ORDER BY t.value DESC, t.product_id)
                        FROM stock_top t), '[]'::jsonb)) FROM stock),
    'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object(
                'day', d.day,
                'orders', COALESCE(sd.orders, 0),
                'revenue', COALESCE(sd.revenue, 0),
                'product_cost', COALESCE(sd.product_cost, 0),
                'courier', COALESCE(pf.fee, 0) + COALESCE(prt.fee, 0),
                'courier_file', COALESCE(ff.fee, 0),
                'refunds', COALESCE(rd.amount, 0),
                'expenses', COALESCE(ed.amount, 0),
                'salaries', COALESCE(pd.amount, 0)) ORDER BY d.day)
              FROM days d
              LEFT JOIN sold_day sd ON sd.day = d.day
              LEFT JOIN prime_fee pf ON pf.day = d.day
              LEFT JOIN prime_returned prt ON prt.day = d.day
              LEFT JOIN file_fee ff ON ff.day = d.day
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