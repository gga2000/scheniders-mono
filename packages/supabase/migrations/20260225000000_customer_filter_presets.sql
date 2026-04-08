-- Migration: Customer Filter Presets
-- Description: Enable users to save and load custom filter combinations for the customers page
-- Created: 2026-02-25

-- Create customer filter presets table
CREATE TABLE IF NOT EXISTS customer_filter_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  user_id TEXT, -- NULL means it's a global/default preset
  filters JSONB NOT NULL, -- Stores the entire filter state
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate preset names per user
  CONSTRAINT unique_preset_per_user UNIQUE (user_id, name)
);

-- Create indexes for performance
CREATE INDEX idx_filter_presets_user ON customer_filter_presets(user_id);
CREATE INDEX idx_filter_presets_name ON customer_filter_presets(name);

-- Add RLS policies (Row Level Security)
ALTER TABLE customer_filter_presets ENABLE ROW LEVEL SECURITY;

-- Users can read their own presets and global presets
CREATE POLICY "Users can read own and global presets"
  ON customer_filter_presets
  FOR SELECT
  USING (user_id = auth.uid()::text OR user_id IS NULL);

-- Users can create their own presets
CREATE POLICY "Users can create own presets"
  ON customer_filter_presets
  FOR INSERT
  WITH CHECK (user_id = auth.uid()::text);

-- Users can update their own presets
CREATE POLICY "Users can update own presets"
  ON customer_filter_presets
  FOR UPDATE
  USING (user_id = auth.uid()::text);

-- Users can delete their own presets
CREATE POLICY "Users can delete own presets"
  ON customer_filter_presets
  FOR DELETE
  USING (user_id = auth.uid()::text);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_filter_preset_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_filter_preset_updated_at
  BEFORE UPDATE ON customer_filter_presets
  FOR EACH ROW
  EXECUTE FUNCTION update_filter_preset_timestamp();

-- Insert some default/example presets
INSERT INTO customer_filter_presets (name, user_id, filters) VALUES
  ('High Value VIPs', NULL, '{"status": "vip", "minLtv": 500000}'::jsonb),
  ('New Customers This Month', NULL, '{"status": "new", "lastOrderWithinDays": 30}'::jsonb),
  ('At Risk VIPs', NULL, '{"status": "vip", "lastOrderWithinDays": 90}'::jsonb),
  ('Dormant Customers', NULL, '{"lastOrderWithinDays": 180}'::jsonb)
ON CONFLICT DO NOTHING;

-- Comment on table
COMMENT ON TABLE customer_filter_presets IS 'Stores saved filter combinations for the customers page, allowing users to quickly apply frequently used filter sets';
COMMENT ON COLUMN customer_filter_presets.filters IS 'JSONB object containing all filter parameters (status, city, ltv ranges, tags, etc.)';
