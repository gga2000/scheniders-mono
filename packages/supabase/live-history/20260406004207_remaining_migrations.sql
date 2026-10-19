-- Drop the view if it exists
DROP VIEW IF EXISTS v_orders_with_risk;

-- Create the view with security_invoker = true so RLS is respected
CREATE OR REPLACE VIEW v_orders_with_risk WITH (security_invoker = true) AS
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
LEFT JOIN customer_risk cr ON normalize_phone(COALESCE(o.phone, '')) = cr.phone;

GRANT SELECT ON v_orders_with_risk TO authenticated, anon, service_role;
NOTIFY pgrst, 'reload schema';;
