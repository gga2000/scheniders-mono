-- Migration: Add is_test column to orders table
-- Description: Allows identifying orders created for testing purposes.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- Add comment for clarity
COMMENT ON COLUMN orders.is_test IS 'Flag to identify orders created via the test button or for testing purposes.';

-- Update the view to include the new column
-- First, drop the view
DROP VIEW IF EXISTS v_orders_with_risk;

-- Recreate the view with the correct subquery for risk_data
CREATE VIEW v_orders_with_risk AS
SELECT 
    o.*,
    (
        SELECT jsonb_build_object(
            'level', cr.risk_level,
            'score', cr.score,
            'reasons', cr.reasons,
            'stats', cr.stats,
            'last_updated', cr.last_updated
        )
        FROM customer_risk cr
        WHERE cr.phone = normalize_phone(o.phone)
           OR cr.phone = normalize_phone(o.secondary_phone)
        ORDER BY cr.last_updated DESC
        LIMIT 1
    ) as risk_data
FROM orders o;

-- Keep permissions
GRANT SELECT ON v_orders_with_risk TO authenticated;
ALTER VIEW v_orders_with_risk SET (security_invoker = true);
