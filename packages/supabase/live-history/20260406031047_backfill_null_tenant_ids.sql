
-- Backfill tenant_id on activity_logs using the user's current_tenant_id
UPDATE activity_logs al
SET tenant_id = up.current_tenant_id
FROM user_profiles up
WHERE al.user_id = up.id
  AND al.tenant_id IS NULL
  AND up.current_tenant_id IS NOT NULL;

-- Backfill tenant_id on customer_filter_presets (user_id is text, needs cast)
UPDATE customer_filter_presets cfp
SET tenant_id = up.current_tenant_id
FROM user_profiles up
WHERE cfp.user_id::uuid = up.id
  AND cfp.tenant_id IS NULL
  AND up.current_tenant_id IS NOT NULL;

-- Add tenant_id to role_salary_defaults for multi-tenant isolation
ALTER TABLE role_salary_defaults ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_role_salary_defaults_tenant ON role_salary_defaults(tenant_id);
;
