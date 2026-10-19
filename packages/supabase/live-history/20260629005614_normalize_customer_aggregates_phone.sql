DROP MATERIALIZED VIEW IF EXISTS public.mv_customer_aggregates;

CREATE MATERIALIZED VIEW public.mv_customer_aggregates AS
WITH order_stats AS (
    SELECT o.id, o.tenant_id,
        REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', '') AS norm_phone,
        o.customer_name, o.city, o.governorate_code, o.price, o.created_at, o.status,
        o.secondary_phone, o.address_details,
        (SELECT COALESCE(sum((item.value ->> 'quantity')::numeric), 0::numeric)
           FROM jsonb_array_elements(
                CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END
           ) item(value)) AS order_items_count
    FROM orders o
    WHERE o.phone IS NOT NULL
      AND REGEXP_REPLACE(REGEXP_REPLACE(o.phone, '[^0-9]', '', 'g'), '^(964|0)', '') <> ''
),
last_order_details AS (
    SELECT DISTINCT ON (os.norm_phone, os.tenant_id)
        os.norm_phone, os.tenant_id,
        os.id AS last_order_id, os.status AS last_order_status,
        os.secondary_phone AS latest_secondary_phone, os.address_details AS latest_address_details,
        os.customer_name AS last_name, os.city AS last_city, os.governorate_code AS last_gov
    FROM order_stats os
    ORDER BY os.norm_phone, os.tenant_id, os.created_at DESC
)
SELECT os.norm_phone AS customer_phone,
    os.tenant_id,
    l.last_name AS latest_name,
    l.last_city AS latest_city,
    l.last_gov AS latest_governorate,
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
JOIN last_order_details l ON os.norm_phone = l.norm_phone AND os.tenant_id = l.tenant_id
GROUP BY os.norm_phone, os.tenant_id, l.last_name, l.last_city, l.last_gov,
    l.last_order_id, l.last_order_status, l.latest_secondary_phone, l.latest_address_details;

CREATE UNIQUE INDEX uq_mv_customer_agg_tenant_phone
    ON public.mv_customer_aggregates (tenant_id, customer_phone);
CREATE INDEX idx_mv_customer_agg_tenant ON public.mv_customer_aggregates (tenant_id);
CREATE INDEX idx_mv_customer_agg_phone ON public.mv_customer_aggregates (customer_phone);;
