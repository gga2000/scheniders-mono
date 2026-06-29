-- Key customers by NORMALIZED phone so the same person isn't fragmented into
-- multiple rows by phone format (07…, 964…, +964…). Previously mv_customer_aggregates
-- GROUPed BY raw o.phone → ~159 customers (real tenant) split across duplicate rows,
-- splitting their order counts / spend / history.
--
-- Also fixes a latent correctness bug: latest_name/city/governorate used max()
-- (alphabetically last, NOT most recent). Now they come from the customer's LATEST
-- order (DISTINCT ON … ORDER BY created_at DESC).
--
-- Matview redefinition requires DROP + CREATE. The SECURITY DEFINER functions and
-- the pg_cron refresh reference it by name (resolved at runtime), so they survive.
-- The unique index (required for REFRESH … CONCURRENTLY) is rebuilt on the
-- normalized key.

DROP MATERIALIZED VIEW IF EXISTS public.mv_customer_aggregates;

CREATE MATERIALIZED VIEW public.mv_customer_aggregates AS
WITH order_stats AS (
    SELECT
        o.id,
        REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', '') AS norm_phone,
        o.price,
        o.created_at,
        o.tenant_id,
        (
            SELECT COALESCE(SUM((item.value ->> 'quantity')::numeric), 0::numeric)
            FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(o.items) = 'array'::text THEN o.items ELSE '[]'::jsonb END
            ) item(value)
        ) AS order_items_count
    FROM orders o
    WHERE o.phone IS NOT NULL
      AND REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', '') <> ''
),
last_order_details AS (
    SELECT DISTINCT ON (REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', ''), o.tenant_id)
        REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', '') AS norm_phone,
        o.tenant_id,
        o.id AS last_order_id,
        o.status AS last_order_status,
        o.customer_name AS latest_name,
        o.city AS latest_city,
        o.governorate_code AS latest_governorate,
        o.secondary_phone AS latest_secondary_phone,
        o.address_details AS latest_address_details
    FROM orders o
    WHERE o.phone IS NOT NULL
      AND REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', '') <> ''
    ORDER BY REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', ''), o.tenant_id, o.created_at DESC
)
SELECT
    os.norm_phone AS customer_phone,
    os.tenant_id,
    l.latest_name,
    l.latest_city,
    l.latest_governorate,
    count(os.id) AS total_orders,
    sum(os.price) AS total_spent,
    max(os.created_at) AS last_order_date,
    min(os.created_at) AS first_order_date,
    COALESCE(sum(os.order_items_count), 0::numeric) AS total_items,
    l.last_order_id,
    l.last_order_status,
    l.latest_secondary_phone,
    l.latest_address_details
FROM order_stats os
LEFT JOIN last_order_details l
    ON os.norm_phone = l.norm_phone AND os.tenant_id = l.tenant_id
GROUP BY os.norm_phone, os.tenant_id,
    l.latest_name, l.latest_city, l.latest_governorate,
    l.last_order_id, l.last_order_status, l.latest_secondary_phone, l.latest_address_details;

-- Unique index (required for REFRESH MATERIALIZED VIEW CONCURRENTLY) + lookups.
CREATE UNIQUE INDEX uq_mv_customer_agg_tenant_phone ON public.mv_customer_aggregates (tenant_id, customer_phone);
CREATE INDEX idx_mv_customer_agg_tenant ON public.mv_customer_aggregates (tenant_id);
CREATE INDEX idx_mv_customer_agg_phone ON public.mv_customer_aggregates (customer_phone);
