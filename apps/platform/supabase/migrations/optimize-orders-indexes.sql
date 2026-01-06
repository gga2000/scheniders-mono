-- Migration: Add indexes to optimize orders query performance
-- Created: 2026-01-06
-- Purpose: Reduce orders fetch time from 5.4s to <1s

-- ================================================
-- INDEX 1: Main orders list query optimization
-- Used by: fetchOrders() - filters by is_archived, sorts by created_at DESC
-- Expected impact: Major improvement for main list query
-- ================================================
CREATE INDEX IF NOT EXISTS idx_orders_is_archived_created_at 
ON orders (is_archived, created_at DESC);

-- ================================================
-- INDEX 2: Status filtering optimization
-- Used by: Status tabs/filters on orders page
-- Partial index only for non-archived orders (most common case)
-- ================================================
CREATE INDEX IF NOT EXISTS idx_orders_status_active 
ON orders (status) 
WHERE is_archived = false;

-- ================================================
-- INDEX 3: Phone number search optimization
-- Used by: Customer lookup, duplicate detection, global search
-- ================================================
CREATE INDEX IF NOT EXISTS idx_orders_phone 
ON orders (phone);

-- ================================================
-- INDEX 4: Date range queries optimization
-- Used by: Analytics, date filters, reporting
-- ================================================
CREATE INDEX IF NOT EXISTS idx_orders_created_at 
ON orders (created_at DESC);

-- ================================================
-- INDEX 5: City filtering optimization
-- Used by: Geographic analytics, city filters
-- ================================================
CREATE INDEX IF NOT EXISTS idx_orders_city 
ON orders (city) 
WHERE city IS NOT NULL;

-- Analyze table to update query planner statistics
ANALYZE orders;
