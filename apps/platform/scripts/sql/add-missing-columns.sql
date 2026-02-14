-- Add missing internal_notes column to orders table
ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- If you also need other columns that might be missing, add them here:
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_status TEXT DEFAULT 'needs_review';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS address_issues TEXT[];
ALTER TABLE orders ADD COLUMN IF NOT EXISTS validated_governorate_code TEXT;
