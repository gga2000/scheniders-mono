-- =============================================
-- Migration: Auto-Send Pipeline & Contact Tracking
-- Run this in Supabase SQL Editor
-- =============================================

-- 1. Add last_contacted_at column to orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ DEFAULT NULL;

-- 2. Create app_settings table for global toggles
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Insert default auto-send setting
INSERT INTO app_settings (key, value)
VALUES ('whatsapp_auto_send', '{"enabled": false, "default_discount_percent": 10}')
ON CONFLICT (key) DO NOTHING;

-- 4. Atomic contact count increment function
CREATE OR REPLACE FUNCTION increment_contact_count(order_uuid UUID)
RETURNS void AS $$
BEGIN
  UPDATE orders
  SET contact_count = COALESCE(contact_count, 0) + 1,
      last_contacted_at = NOW(),
      updated_at = NOW()
  WHERE id = order_uuid;
END;
$$ LANGUAGE plpgsql;

-- 5. Backfill last_contacted_at for existing contacted orders
UPDATE orders
SET last_contacted_at = updated_at
WHERE status IN ('contacted', 'no_response')
  AND last_contacted_at IS NULL
  AND contact_count > 0;
