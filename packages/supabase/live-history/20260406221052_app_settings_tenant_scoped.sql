
-- Add tenant_id to app_settings for multi-tenant isolation
ALTER TABLE app_settings ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- Drop old primary key (key only) and create composite key
ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_pkey;
ALTER TABLE app_settings ADD PRIMARY KEY (key, tenant_id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_app_settings_tenant ON app_settings(tenant_id);

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can only access their tenant's settings
DROP POLICY IF EXISTS "tenant_isolation" ON app_settings;
CREATE POLICY "tenant_isolation" ON app_settings
    FOR ALL
    USING (tenant_id IN (SELECT get_user_tenant_ids()));
;
