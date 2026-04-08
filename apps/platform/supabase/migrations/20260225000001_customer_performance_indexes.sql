-- Migration: Customer Performance Indexes
-- Description: Add indexes to optimize customer filtering and searching
-- Created: 2026-02-25

-- Index for governorate filtering (new filter being added)
CREATE INDEX IF NOT EXISTS idx_customer_agg_governorate
  ON mv_customer_aggregates(latest_governorate)
  WHERE latest_governorate IS NOT NULL;

-- Index for first order date filtering (date range filters)
CREATE INDEX IF NOT EXISTS idx_customer_agg_first_order
  ON mv_customer_aggregates(first_order_date)
  WHERE first_order_date IS NOT NULL;

-- Index for total orders filtering (order count range)
CREATE INDEX IF NOT EXISTS idx_customer_agg_total_orders
  ON mv_customer_aggregates(total_orders);

-- Composite index for customer tag queries (multi-tag filtering)
CREATE INDEX IF NOT EXISTS idx_customer_tags_composite
  ON customer_tag_assignments(customer_phone, tag_id);

-- Index for phone number searches (for duplicate detection)
CREATE INDEX IF NOT EXISTS idx_customer_agg_phone
  ON mv_customer_aggregates(customer_phone);

-- Index for city searches
CREATE INDEX IF NOT EXISTS idx_customer_agg_city
  ON mv_customer_aggregates(latest_city)
  WHERE latest_city IS NOT NULL;

-- Composite index for LTV filtering (status is calculated, not stored)
CREATE INDEX IF NOT EXISTS idx_customer_agg_spent_orders
  ON mv_customer_aggregates(total_spent DESC, total_orders DESC);

-- Comment on indexes
COMMENT ON INDEX idx_customer_agg_governorate IS 'Optimizes filtering customers by governorate';
COMMENT ON INDEX idx_customer_agg_first_order IS 'Optimizes date range filtering by first purchase date';
COMMENT ON INDEX idx_customer_agg_total_orders IS 'Optimizes filtering by order count range';
COMMENT ON INDEX idx_customer_tags_composite IS 'Optimizes multi-tag filtering queries';
COMMENT ON INDEX idx_customer_agg_spent_orders IS 'Optimizes LTV and status-based filtering (VIP = high spend/orders)';
