-- Drop the trigger that causes duplicate entries
DROP TRIGGER IF EXISTS on_order_status_change ON orders;

-- Drop the function
DROP FUNCTION IF EXISTS record_status_change();

-- Optional: Cleanup existing duplicates (keep the one with changed_by populated if exists, else keep latest)
-- This is a bit complex to do safely in SQL without manual review, so we'll just stop future duplicates.
-- But if we want to clean up:
-- DELETE FROM order_status_history a USING order_status_history b
-- WHERE a.id < b.id 
-- AND a.order_id = b.order_id 
-- AND a.to_status = b.to_status 
-- AND abs(extract(epoch from (a.changed_at - b.changed_at))) < 2; -- Within 2 seconds
