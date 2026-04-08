-- Run this in your Supabase SQL Editor to add the secondary_phone column:

ALTER TABLE orders ADD COLUMN IF NOT EXISTS secondary_phone TEXT;

-- After running this, you can run the script again to populate secondary phones:
-- npx tsx scripts/add-secondary-phones.ts
