-- Phase 3: Zero-Latency Risk Integration

-- Create a view that joins orders with customer_risk instantly
CREATE OR REPLACE VIEW v_orders_with_risk AS
SELECT 
    o.*,
    jsonb_build_object(
        'level', cr.risk_level,
        'score', cr.score,
        'reasons', cr.reasons,
        'stats', cr.stats,
        'last_updated', cr.last_updated
    ) as risk_data
FROM orders o
LEFT JOIN customer_risk cr 
    ON normalize_phone(o.phone) = cr.phone 
    OR normalize_phone(o.secondary_phone) = cr.phone;

-- Grant access to the view
GRANT SELECT ON v_orders_with_risk TO authenticated;

-- Since this is a view over tables with RLS, the view itself does not need RLS policies, 
-- it automatically enforces the underlying tables' RLS when queried. 
-- However, we must ensure the view is created with security invoker if supported, or just rely on Supabase defaults.
-- In Postgres 15+, we can set security_invoker = true.
ALTER VIEW v_orders_with_risk SET (security_invoker = true);
