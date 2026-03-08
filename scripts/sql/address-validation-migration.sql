-- Address Validation Migration
-- Adds fields for address validation status and standardized governorate codes

-- Add address validation columns to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS address_status TEXT DEFAULT 'needs_review',
ADD COLUMN IF NOT EXISTS address_issues TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS validated_governorate_code TEXT;

-- Create indexes for filtering
CREATE INDEX IF NOT EXISTS idx_orders_address_status ON orders(address_status);
CREATE INDEX IF NOT EXISTS idx_orders_validated_gov ON orders(validated_governorate_code);

-- Address corrections table for learning system
CREATE TABLE IF NOT EXISTS address_corrections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    original_input TEXT NOT NULL,
    corrected_governorate_code TEXT NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    corrected_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_address_corrections_input ON address_corrections(original_input);
CREATE INDEX IF NOT EXISTS idx_address_corrections_gov ON address_corrections(corrected_governorate_code);

-- Comment explaining the address_status values
COMMENT ON COLUMN orders.address_status IS 'valid = good address, incomplete = only governorate, invalid = unrecognized, needs_review = possible typo';
COMMENT ON COLUMN orders.validated_governorate_code IS 'Our standardized code: BGD, NAS, DYL, KOT, KRB, DOH, BBL, NJF, BAS, ARB, KRK, SAM, SAH, ANB, SMH, MOS, DWN, AMA';
