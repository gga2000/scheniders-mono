-- =============================================
-- SETTINGS & CONFIGURATION SCHEMA
-- =============================================

-- 1. APP SETTINGS TABLE
-- Key-value store for global application settings
-- =============================================

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read/write settings
-- (Assuming all dashboard users are admins/staff)
CREATE POLICY "Allow all for authenticated" ON app_settings 
  FOR ALL 
  USING (auth.role() = 'authenticated') 
  WITH CHECK (auth.role() = 'authenticated');

-- 2. DEFAULT SEED DATA
-- Initialize with common defaults
-- =============================================

INSERT INTO app_settings (key, value, description) VALUES
  (
    'store_profile', 
    '{"name": "Schneiders", "currency": "IQD", "timezone": "Asia/Baghdad"}', 
    'General store profile settings'
  ),
  (
    'delivery_fees', 
    '{"default": 5000, "baghdad": 5000, "provinces": 8000, "free_shipping_threshold": 0}', 
    'Default delivery fees configuration'
  ),
  (
    'inventory_rules', 
    '{"low_stock_threshold": 5, "enable_stock_alerts": true}', 
    'Inventory management rules'
  ),
  (
    'print_settings', 
    '{"label_size": "4x6", "show_price": true, "show_phone": true, "batch_grouping": "city"}', 
    'Default printing configuration'
  ),
  (
    'auto_archive', 
    '{"enabled": false, "days": 60, "archive_canceled": true, "archive_delivered": true}', 
    'Auto-archiving rules for old orders'
  ),
  (
    'quick_actions', 
    '{"show_cancel": true, "show_reject": true, "show_whatsapp": true, "show_print": true}', 
    'Visibility of action buttons on order cards'
  )
ON CONFLICT (key) DO NOTHING;

-- 3. HELPER FUNCTION
-- =============================================
-- Function to easily get a setting value safely
CREATE OR REPLACE FUNCTION get_setting(setting_key TEXT)
RETURNS JSONB AS $$
BEGIN
  RETURN (SELECT value FROM app_settings WHERE key = setting_key);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
