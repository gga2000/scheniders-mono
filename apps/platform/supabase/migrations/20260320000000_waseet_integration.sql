-- =============================================
-- Al-Waseet Delivery API Integration
-- Adds support for Al-Waseet as a second delivery company
-- alongside the existing Prime integration
-- =============================================

-- 1. New columns on orders table for Al-Waseet tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_company TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_qr_id TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_qr_link TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_status_id INT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_status_text TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_merchant_price NUMERIC DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_company_price NUMERIC DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_submitted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS waseet_invoice_id TEXT DEFAULT NULL;

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_orders_delivery_company ON orders(delivery_company) WHERE delivery_company IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_waseet_qr_id ON orders(waseet_qr_id) WHERE waseet_qr_id IS NOT NULL;

-- 2. City/Region mapping table
CREATE TABLE IF NOT EXISTS waseet_city_mappings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    governorate_code TEXT NOT NULL UNIQUE,
    governorate_name_ar TEXT NOT NULL,
    waseet_city_id INT NOT NULL,
    waseet_city_name TEXT NOT NULL,
    waseet_default_region_id INT,
    waseet_default_region_name TEXT,
    is_active BOOLEAN DEFAULT true
);

-- RLS for waseet_city_mappings
ALTER TABLE waseet_city_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on waseet_city_mappings"
    ON waseet_city_mappings FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow service role all on waseet_city_mappings"
    ON waseet_city_mappings FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 3. API audit log table
CREATE TABLE IF NOT EXISTS waseet_api_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    endpoint TEXT NOT NULL,
    method TEXT NOT NULL,
    request_data JSONB,
    response_data JSONB,
    http_status INT,
    success BOOLEAN NOT NULL DEFAULT false,
    error_message TEXT,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    duration_ms INT,
    triggered_by TEXT DEFAULT 'manual'
);

CREATE INDEX IF NOT EXISTS idx_waseet_api_logs_created_at ON waseet_api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waseet_api_logs_order_id ON waseet_api_logs(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waseet_api_logs_endpoint ON waseet_api_logs(endpoint);

-- RLS for waseet_api_logs
ALTER TABLE waseet_api_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on waseet_api_logs"
    ON waseet_api_logs FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow service role all on waseet_api_logs"
    ON waseet_api_logs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- 4. Update the v_orders_with_risk view to include new columns
-- The view uses o.* so new columns are automatically included.
-- No view modification needed.
