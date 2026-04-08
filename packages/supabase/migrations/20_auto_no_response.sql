-- =============================================
-- Auto-Move Contacted Orders to No Response
-- Orders in "contacted" status for > 2 days
-- =============================================

-- Function: Find and update orders in "contacted" status for > X days
-- Uses order_status_history to determine when order became "contacted"
CREATE OR REPLACE FUNCTION auto_move_to_no_response(days_threshold INTEGER DEFAULT 2)
RETURNS INTEGER AS $$
DECLARE
  affected_count INTEGER;
BEGIN
  -- Find orders that:
  -- 1. Are currently in "contacted" status
  -- 2. Were moved to "contacted" more than X days ago
  -- 3. Haven't had any status changes since then
  WITH stale_contacted AS (
    SELECT DISTINCT o.id
    FROM orders o
    INNER JOIN order_status_history osh ON o.id = osh.order_id
    WHERE o.status = 'contacted'
      AND osh.to_status = 'contacted'
      AND osh.changed_at < NOW() - (days_threshold || ' days')::INTERVAL
      -- Make sure this was the LAST status change (no subsequent changes)
      AND NOT EXISTS (
        SELECT 1 FROM order_status_history osh2
        WHERE osh2.order_id = o.id
          AND osh2.changed_at > osh.changed_at
      )
  )
  UPDATE orders
  SET status = 'no_response', updated_at = NOW()
  WHERE id IN (SELECT id FROM stale_contacted);
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION auto_move_to_no_response(INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_move_to_no_response(INTEGER) TO anon;

-- Comment
COMMENT ON FUNCTION auto_move_to_no_response IS 'Automatically moves orders stuck in contacted status to no_response after specified days threshold';

-- =============================================
-- Preview Query (for testing - run separately)
-- =============================================
-- SELECT o.id, o.order_id, o.customer_name, o.status, osh.changed_at,
--        NOW() - osh.changed_at AS days_since_contacted
-- FROM orders o
-- INNER JOIN order_status_history osh ON o.id = osh.order_id
-- WHERE o.status = 'contacted'
--   AND osh.to_status = 'contacted'
--   AND osh.changed_at < NOW() - INTERVAL '2 days'
--   AND NOT EXISTS (
--     SELECT 1 FROM order_status_history osh2
--     WHERE osh2.order_id = o.id
--       AND osh2.changed_at > osh.changed_at
--   );
