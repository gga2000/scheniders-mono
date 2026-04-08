-- Team Management Migration
-- Adds user profiles, roles, activity logging, and order assignments

-- =============================================
-- USER PROFILES TABLE
-- Extends Supabase auth.users with app-specific data
-- =============================================

CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'employee' CHECK (role IN ('admin', 'employee', 'viewer')),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies for user_profiles
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read all profiles (for UI display)
CREATE POLICY "Users can view all profiles" ON user_profiles
    FOR SELECT USING (true);

-- Only admins can insert/update/delete profiles
CREATE POLICY "Admins can manage profiles" ON user_profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Users can update their own profile (limited fields)
CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- =============================================
-- ACTIVITY LOG TABLE
-- Tracks all user actions for audit trail
-- =============================================

CREATE TABLE IF NOT EXISTS activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES user_profiles(id),
    user_email VARCHAR(255), -- Denormalized for faster queries
    action VARCHAR(100) NOT NULL, -- 'order.status_change', 'order.edit', 'order.create', etc.
    entity_type VARCHAR(50), -- 'order', 'product', 'customer', 'settings'
    entity_id VARCHAR(255), -- The ID of the affected entity
    details JSONB, -- { from_status: 'new', to_status: 'confirmed', order_id: 'xxx', etc. }
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_action ON activity_log(action);
CREATE INDEX idx_activity_log_entity ON activity_log(entity_type, entity_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);

-- RLS Policies for activity_log
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Viewers and above can read activity logs
CREATE POLICY "Authenticated users can view activity logs" ON activity_log
    FOR SELECT USING (auth.uid() IS NOT NULL);

-- All authenticated users can insert (their own actions are logged)
CREATE POLICY "Authenticated users can insert activity logs" ON activity_log
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- =============================================
-- ORDER ASSIGNMENTS
-- Add assigned_to column to orders table
-- =============================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES user_profiles(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;

-- Index for faster assignment queries
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON orders(assigned_to);

-- =============================================
-- HELPER FUNCTION: Auto-create user profile on signup
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_profiles (id, email, display_name, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'role', 'employee')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to auto-create profile on user signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- HELPER FUNCTION: Log activity
-- =============================================

CREATE OR REPLACE FUNCTION public.log_activity(
    p_action VARCHAR(100),
    p_entity_type VARCHAR(50) DEFAULT NULL,
    p_entity_id VARCHAR(255) DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID AS $$
DECLARE
    v_user_email VARCHAR(255);
    v_log_id UUID;
BEGIN
    -- Get user email
    SELECT email INTO v_user_email FROM user_profiles WHERE id = auth.uid();
    
    INSERT INTO activity_log (user_id, user_email, action, entity_type, entity_id, details)
    VALUES (auth.uid(), v_user_email, p_action, p_entity_type, p_entity_id, p_details)
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
