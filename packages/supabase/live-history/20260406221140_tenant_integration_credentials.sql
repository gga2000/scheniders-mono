
-- Tenant integration credentials - stores per-tenant API keys for integrations
CREATE TABLE IF NOT EXISTS tenant_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'lightfunnels', 'interakt', 'waseet'
    credentials JSONB NOT NULL DEFAULT '{}', -- encrypted-at-rest by Supabase
    is_active BOOLEAN DEFAULT false,
    connected_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant ON tenant_integrations(tenant_id);

-- Enable RLS
ALTER TABLE tenant_integrations ENABLE ROW LEVEL SECURITY;

-- RLS: tenant members can manage their own integrations
CREATE POLICY "tenant_isolation" ON tenant_integrations
    FOR ALL
    USING (tenant_id IN (SELECT get_user_tenant_ids()));
;
