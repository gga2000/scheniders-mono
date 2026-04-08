-- Create table for storing role-based permissions
CREATE TABLE IF NOT EXISTS role_permissions (
    role VARCHAR(50) NOT NULL,
    permission VARCHAR(100) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (role, permission)
);

-- Enable RLS
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- Policies
-- Admins can manage permissions
CREATE POLICY "Admins can manage permissions" ON role_permissions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE user_profiles.id = auth.uid()
            AND user_profiles.role = 'admin'
        )
    );

-- Everyone can view permissions (needed for enforcement)
CREATE POLICY "Everyone can view permissions" ON role_permissions
    FOR SELECT
    USING (true);

-- Seed defaults (Idempotent)
INSERT INTO role_permissions (role, permission) VALUES
-- Admin (All)
('admin', 'orders.view'),
('admin', 'orders.create'),
('admin', 'orders.edit'),
('admin', 'orders.delete'),
('admin', 'orders.export'),
('admin', 'customers.view'),
('admin', 'customers.edit'),
('admin', 'customers.block'),
('admin', 'system.users.manage'),
('admin', 'system.analytics.view'),
('admin', 'system.settings.access'),

-- Employee
('employee', 'orders.view'),
('employee', 'orders.create'),
('employee', 'orders.edit'),
('employee', 'orders.export'),
('employee', 'customers.view'),
('employee', 'customers.edit'),
('employee', 'customers.block'),
('employee', 'system.analytics.view'),

-- Viewer
('viewer', 'orders.view'),
('viewer', 'customers.view'),
('viewer', 'system.analytics.view')
ON CONFLICT (role, permission) DO NOTHING;
