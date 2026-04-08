-- Employee Tracking Enhancement Migration
-- Adds performance tracking view and indexes for employee activity analysis

-- =============================================
-- EMPLOYEE STATS VIEW
-- Aggregates activity data for leaderboard and performance tracking
-- =============================================

CREATE OR REPLACE VIEW employee_stats AS
SELECT 
    user_id,
    user_email,
    COUNT(*) as total_actions,
    COUNT(*) FILTER (WHERE action = 'order.status_change') as status_changes,
    COUNT(*) FILTER (WHERE action = 'order.create') as orders_created,
    COUNT(*) FILTER (WHERE action = 'order.print') as orders_printed,
    COUNT(*) FILTER (WHERE action = 'order.edit') as orders_edited,
    COUNT(*) FILTER (WHERE action = 'customer.blacklist') as customers_blacklisted,
    MIN(created_at) as first_action_at,
    MAX(created_at) as last_action_at
FROM activity_log
WHERE user_id IS NOT NULL
GROUP BY user_id, user_email;

-- =============================================
-- WEEKLY EMPLOYEE STATS VIEW
-- For weekly leaderboard
-- =============================================

CREATE OR REPLACE VIEW employee_stats_weekly AS
SELECT 
    user_id,
    user_email,
    COUNT(*) as total_actions,
    COUNT(*) FILTER (WHERE action = 'order.status_change') as status_changes,
    COUNT(*) FILTER (WHERE action = 'order.create') as orders_created,
    COUNT(*) FILTER (WHERE action = 'order.print') as orders_printed
FROM activity_log
WHERE user_id IS NOT NULL 
  AND created_at >= NOW() - INTERVAL '7 days'
GROUP BY user_id, user_email;

-- =============================================
-- MONTHLY EMPLOYEE STATS VIEW
-- For monthly leaderboard
-- =============================================

CREATE OR REPLACE VIEW employee_stats_monthly AS
SELECT 
    user_id,
    user_email,
    COUNT(*) as total_actions,
    COUNT(*) FILTER (WHERE action = 'order.status_change') as status_changes,
    COUNT(*) FILTER (WHERE action = 'order.create') as orders_created,
    COUNT(*) FILTER (WHERE action = 'order.print') as orders_printed
FROM activity_log
WHERE user_id IS NOT NULL 
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY user_id, user_email;

-- =============================================
-- ADDITIONAL INDEXES FOR PERFORMANCE
-- =============================================

-- Index for faster date-range queries on activity_log
CREATE INDEX IF NOT EXISTS idx_activity_log_user_created 
ON activity_log(user_id, created_at DESC);

-- Index for action type filtering with date
CREATE INDEX IF NOT EXISTS idx_activity_log_action_created 
ON activity_log(action, created_at DESC);

-- =============================================
-- ADD PERFORMANCE TRACKING COLUMNS TO USER_PROFILES
-- These will be updated periodically or via triggers
-- =============================================

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS total_actions_count INTEGER DEFAULT 0;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS weekly_actions_count INTEGER DEFAULT 0;

ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS monthly_actions_count INTEGER DEFAULT 0;

-- =============================================
-- FUNCTION: Update user action counts
-- Call this periodically or after significant activity
-- =============================================

CREATE OR REPLACE FUNCTION update_user_action_counts()
RETURNS void AS $$
BEGIN
    -- Update all-time counts
    UPDATE user_profiles up
    SET total_actions_count = COALESCE(stats.total, 0)
    FROM (
        SELECT user_id, COUNT(*) as total
        FROM activity_log
        WHERE user_id IS NOT NULL
        GROUP BY user_id
    ) stats
    WHERE up.id = stats.user_id;

    -- Update weekly counts
    UPDATE user_profiles up
    SET weekly_actions_count = COALESCE(stats.total, 0)
    FROM (
        SELECT user_id, COUNT(*) as total
        FROM activity_log
        WHERE user_id IS NOT NULL 
          AND created_at >= NOW() - INTERVAL '7 days'
        GROUP BY user_id
    ) stats
    WHERE up.id = stats.user_id;

    -- Update monthly counts
    UPDATE user_profiles up
    SET monthly_actions_count = COALESCE(stats.total, 0)
    FROM (
        SELECT user_id, COUNT(*) as total
        FROM activity_log
        WHERE user_id IS NOT NULL 
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY user_id
    ) stats
    WHERE up.id = stats.user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to authenticated users to read stats views
GRANT SELECT ON employee_stats TO authenticated;
GRANT SELECT ON employee_stats_weekly TO authenticated;
GRANT SELECT ON employee_stats_monthly TO authenticated;
