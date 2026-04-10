-- ============================================================================
-- Migration: Add merchant tags column and computed metrics
-- ============================================================================

-- 1. Add tags column to tenants table
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 2. Create index on tags for efficient filtering
CREATE INDEX IF NOT EXISTS idx_tenants_tags ON tenants USING GIN (tags);

-- 3. Create index on wallet_transactions for efficient last-activity lookups
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_tenant_created
ON wallet_transactions (tenant_id, created_at DESC);

-- 4. Create index on orders for efficient sparkline/count lookups
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created
ON orders (tenant_id, created_at DESC);

-- 5. Create index on wallet_transactions for revenue computation
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_charge_lookup
ON wallet_transactions (tenant_id, type, created_at)
WHERE type = 'charge';
