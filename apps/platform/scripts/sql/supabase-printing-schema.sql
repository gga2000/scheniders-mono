-- =============================================
-- PRINTING ENHANCEMENT SCHEMA
-- =============================================
-- Run this in your Supabase SQL Editor

-- Print batches for grouping orders
CREATE TABLE IF NOT EXISTS print_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    order_count INTEGER DEFAULT 0,
    total_value NUMERIC DEFAULT 0,
    cities TEXT[], -- Array of cities in this batch
    pdf_url TEXT
);

-- Print history log
CREATE TABLE IF NOT EXISTS print_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
    batch_id UUID REFERENCES print_batches(id) ON DELETE SET NULL,
    printed_at TIMESTAMPTZ DEFAULT NOW(),
    print_type TEXT CHECK (print_type IN ('label', 'invoice')),
    label_size TEXT,
    printed_by TEXT
);

-- Add columns to orders table for print tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS print_count INTEGER DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS last_batch_id UUID REFERENCES print_batches(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_gift BOOLEAN DEFAULT FALSE;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_print_history_order_id ON print_history(order_id);
CREATE INDEX IF NOT EXISTS idx_print_history_batch_id ON print_history(batch_id);
CREATE INDEX IF NOT EXISTS idx_print_history_printed_at ON print_history(printed_at);
CREATE INDEX IF NOT EXISTS idx_orders_printed_at ON orders(printed_at);
CREATE INDEX IF NOT EXISTS idx_orders_last_batch_id ON orders(last_batch_id);

-- RLS Policies (enable once you confirm they work)
ALTER TABLE print_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_history ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users (adjust as needed)
CREATE POLICY "Allow all for print_batches" ON print_batches FOR ALL USING (true);
CREATE POLICY "Allow all for print_history" ON print_history FOR ALL USING (true);
