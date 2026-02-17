-- Add attention and risk columns to orders table

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS needs_attention BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS attention_reasons TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS risk_metadata JSONB DEFAULT '{}'::jsonb;

-- Add index for needs_attention for faster filtering
CREATE INDEX IF NOT EXISTS idx_orders_needs_attention ON orders(needs_attention) WHERE needs_attention = TRUE;
