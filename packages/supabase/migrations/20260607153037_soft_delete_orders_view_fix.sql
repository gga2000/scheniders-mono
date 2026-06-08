-- Soft-delete orders: deleted_at column + index + risk view filter.
--
-- The view must be rebuilt with DROP + CREATE (not CREATE OR REPLACE):
-- v_orders_with_risk selects `o.*`, so adding the deleted_at column changes the
-- view's output columns, and CREATE OR REPLACE VIEW cannot add/rename columns.
-- DROP + CREATE is the only replay-safe way to fold the new column in.

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON "orders" ("deleted_at");

DROP VIEW IF EXISTS public.v_orders_with_risk;

CREATE VIEW public.v_orders_with_risk WITH (security_invoker = true) AS
SELECT
    o.*,
    COALESCE(
        jsonb_build_object(
            'level', cr.risk_level,
            'score', cr.score,
            'reasons', cr.reasons,
            'isBlacklisted', (cr.risk_level = 'blocked'),
            'historicalData', jsonb_build_object(
                'totalOrders', (cr.stats->>'total')::numeric,
                'rejectedCount', (cr.stats->>'rejected')::numeric,
                'cancelledCount', (cr.stats->>'cancelled')::numeric,
                'noResponseCount', (cr.stats->>'no_response')::numeric
            )
        ),
        jsonb_build_object(
            'level', 'low',
            'score', 0,
            'reasons', '[]'::jsonb,
            'isBlacklisted', false,
            'historicalData', null
        )
    ) as risk_data
FROM orders o
LEFT JOIN customer_risk cr
    ON normalize_phone(COALESCE(o.phone, '')) = cr.phone
    AND cr.tenant_id = o.tenant_id
WHERE o.deleted_at IS NULL;

GRANT SELECT ON v_orders_with_risk TO authenticated, anon, service_role;
