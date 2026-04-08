-- =============================================
-- SCHENIDER OMS: RLS Security Policies
-- =============================================

-- Enable RLS on core tables
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY; -- Table does not exist, uses metadata tables
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;

-- Helper function to check role (Optimized for performance)
-- This assumes you have a 'role' column in user_profiles
CREATE OR REPLACE FUNCTION public.check_user_role(required_roles text[])
RETURNS boolean AS $$
DECLARE
  user_role text;
BEGIN
  -- Look up role in user_profiles
  SELECT role INTO user_role
  FROM public.user_profiles
  WHERE id = auth.uid();

  RETURN user_role = ANY(required_roles);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================
-- ORDERS POLICIES
-- =============================================

-- ADMIN: Full Access
CREATE POLICY "Admin Full Access Orders" ON "orders"
FOR ALL
USING (public.check_user_role(ARRAY['admin']));

-- EMPLOYEE: View, Create, Update
CREATE POLICY "Employee View Orders" ON "orders"
FOR SELECT
USING (public.check_user_role(ARRAY['admin', 'employee', 'viewer']));

CREATE POLICY "Employee Create Orders" ON "orders"
FOR INSERT
WITH CHECK (public.check_user_role(ARRAY['admin', 'employee']));

CREATE POLICY "Employee Update Orders" ON "orders"
FOR UPDATE
USING (public.check_user_role(ARRAY['admin', 'employee']));

-- Viewer: Read Only
-- (Covered by Employee View Orders which includes 'viewer')

-- =============================================
-- CUSTOMERS POLICIES (Metadata tables)
-- =============================================

-- =============================================
-- CUSTOMERS POLICIES (Metadata tables)
-- =============================================

-- Ensure tables exist (Idempotent Schema)
CREATE TABLE IF NOT EXISTS customer_notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_phone TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ BEGIN
    CREATE TYPE tag_color AS ENUM ('yellow', 'green', 'blue', 'pink', 'purple', 'orange', 'red', 'gray');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS customer_tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    color tag_color NOT NULL DEFAULT 'blue',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_tag_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    customer_phone TEXT NOT NULL,
    tag_id UUID NOT NULL REFERENCES customer_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(customer_phone, tag_id)
);

DO $$ BEGIN
    CREATE TYPE customer_status AS ENUM ('new', 'regular', 'vip');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS customer_metadata (
    customer_phone TEXT PRIMARY KEY,
    birthday DATE,
    manual_status customer_status,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (Safe to re-run)
ALTER TABLE customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_metadata ENABLE ROW LEVEL SECURITY;

-- Customer Metadata Policies
DROP POLICY IF EXISTS "Admin Full Access Metadata" ON "customer_metadata";
CREATE POLICY "Admin Full Access Metadata" ON "customer_metadata"
FOR ALL USING (public.check_user_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Employee View Metadata" ON "customer_metadata";
CREATE POLICY "Employee View Metadata" ON "customer_metadata"
FOR SELECT USING (public.check_user_role(ARRAY['admin', 'employee', 'viewer']));

DROP POLICY IF EXISTS "Employee Edit Metadata" ON "customer_metadata";
CREATE POLICY "Employee Edit Metadata" ON "customer_metadata"
FOR UPDATE USING (public.check_user_role(ARRAY['admin', 'employee']));

-- Customer Notes Policies
DROP POLICY IF EXISTS "Admin Full Access Notes" ON "customer_notes";
CREATE POLICY "Admin Full Access Notes" ON "customer_notes"
FOR ALL USING (public.check_user_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Employee View Notes" ON "customer_notes";
CREATE POLICY "Employee View Notes" ON "customer_notes"
FOR SELECT USING (public.check_user_role(ARRAY['admin', 'employee', 'viewer']));

DROP POLICY IF EXISTS "Employee Insert Notes" ON "customer_notes";
CREATE POLICY "Employee Insert Notes" ON "customer_notes"
FOR INSERT WITH CHECK (public.check_user_role(ARRAY['admin', 'employee']));

-- Customer Tags Policies
DROP POLICY IF EXISTS "Admin Full Access Tags" ON "customer_tags";
CREATE POLICY "Admin Full Access Tags" ON "customer_tags"
FOR ALL USING (public.check_user_role(ARRAY['admin']));

DROP POLICY IF EXISTS "Employee View Tags" ON "customer_tags";
CREATE POLICY "Employee View Tags" ON "customer_tags"
FOR SELECT USING (public.check_user_role(ARRAY['admin', 'employee', 'viewer']));

-- =============================================
-- ACTIVITY LOGS
-- =============================================
ALTER TABLE "activity_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View Activity Logs" ON "activity_logs"
FOR SELECT
USING (public.check_user_role(ARRAY['admin', 'employee']));

CREATE POLICY "Insert Activity Logs" ON "activity_logs"
FOR INSERT
WITH CHECK (auth.uid() = user_id);
