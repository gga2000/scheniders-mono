-- Simple fix: Reassign ALL sequence numbers in one statement
-- Run this in Supabase SQL Editor

-- This will assign sequence numbers 1, 2, 3, ... based on creation order
UPDATE orders o
SET sequence_number = sub.row_num
FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) as row_num
    FROM orders
) sub
WHERE o.id = sub.id;

-- Verify: Check sequence numbers are now unique and sequential
-- SELECT COUNT(*), COUNT(DISTINCT sequence_number) FROM orders;
