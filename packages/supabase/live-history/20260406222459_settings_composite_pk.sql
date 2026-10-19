
-- Make settings table multi-tenant safe
-- Drop old PK (key only) and add composite PK
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;

-- tenant_id must not be null for composite PK
ALTER TABLE settings ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE settings ADD PRIMARY KEY (key, tenant_id);

-- Enable RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- RLS policy
DROP POLICY IF EXISTS "tenant_isolation" ON settings;
CREATE POLICY "tenant_isolation" ON settings
    FOR ALL
    USING (tenant_id IN (SELECT get_user_tenant_ids()));
;
