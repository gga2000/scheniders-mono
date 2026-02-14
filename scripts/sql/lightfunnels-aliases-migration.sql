-- =============================================
-- Migration: Add lightfunnels_aliases to products table
-- Purpose: Store Lightfunnels product name variations for matching
-- =============================================

-- Add the lightfunnels_aliases column to products table
-- This stores an array of strings that should map to this product
-- e.g., ['برسيفيرون', 'عطر برسيفيرون', 'عطر برسيفيرون الفاخر']
ALTER TABLE products
ADD COLUMN IF NOT EXISTS lightfunnels_aliases TEXT[] DEFAULT '{}';

-- Add compare_at_price if not exists (may already exist)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS compare_at_price NUMERIC(10, 2);

-- Add tag_color if not exists (may already exist)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS tag_color TEXT;

-- =============================================
-- Populate initial aliases based on known patterns
-- =============================================

-- بيرسيفيرون (Persiferon)
UPDATE products
SET lightfunnels_aliases = ARRAY[
    'برسيفيرون',
    'بيرسيفيرون',
    'بيرسفيرون',
    'عطر برسيفيرون',
    'عطر برسيفيرون الفاخر',
    'عطر برسيفيرون الفاخر من باريس كورنر للرجال'
]
WHERE name = 'بيرسيفيرون';

-- فيوجن (Fusion)
UPDATE products
SET lightfunnels_aliases = ARRAY[
    'فيوجن',
    'عطر فيوجن',
    'عطر فيوجن الفاخر للرجال والنساء',
    'خير فيوجن'
]
WHERE name = 'فيوجن';

-- رفقات (Rifaqat)
UPDATE products
SET lightfunnels_aliases = ARRAY[
    'رفقات',
    'رفقات وايت',
    'رفقات ابيض',
    'عطر رفقات'
]
WHERE name = 'رفقات';

-- ايدنتتي (Identity)
UPDATE products
SET lightfunnels_aliases = ARRAY[
    'ايدنتتي',
    'ايدينتتي',
    'ادينتيتي',
    'عطر ادينتيتي',
    'عطر ايدنتتي'
]
WHERE name ILIKE '%ايدنت%' OR name ILIKE '%ادينت%';

-- بستاشيو (Pistachio)
UPDATE products
SET lightfunnels_aliases = ARRAY[
    'بستاشيو',
    'فستق',
    'عطر بستاشيو'
]
WHERE name ILIKE '%بستاشيو%' OR name ILIKE '%فستق%';

-- Add index for faster alias lookups
CREATE INDEX IF NOT EXISTS idx_products_lightfunnels_aliases 
ON products USING GIN (lightfunnels_aliases);

-- Verify the aliases were added
SELECT id, name, lightfunnels_aliases 
FROM products 
WHERE lightfunnels_aliases IS NOT NULL AND array_length(lightfunnels_aliases, 1) > 0;
