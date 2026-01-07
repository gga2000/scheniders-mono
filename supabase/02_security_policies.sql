-- =============================================
-- 2. SECURITY POLICIES
-- Run this SECOND, after ensuring tables exist
-- =============================================

-- Helper function to check role
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

-- Enable RLS
ALTER TABLE "orders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_tag_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_metadata" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_logs" ENABLE ROW LEVEL SECURITY;

-- =============================================
-- POLICIES
-- =============================================

-- ORDERS
CREATE POLICY "Admin Full Access Orders" ON "orders" FOR ALL USING (public.check_user_role(ARRAY['admin']));
CREATE POLICY "Employee View Orders" ON "orders" FOR SELECT USING (public.check_user_role(ARRAY['admin', 'employee', 'viewer']));
CREATE POLICY "Employee Create Orders" ON "orders" FOR INSERT WITH CHECK (public.check_user_role(ARRAY['admin', 'employee']));
CREATE POLICY "Employee Update Orders" ON "orders" FOR UPDATE USING (public.check_user_role(ARRAY['admin', 'employee']));

-- CUSTOMER METADATA
CREATE POLICY "Admin Full Access Metadata" ON "customer_metadata" FOR ALL USING (public.check_user_role(ARRAY['admin']));
CREATE POLICY "Employee View Metadata" ON "customer_metadata" FOR SELECT USING (public.check_user_role(ARRAY['admin', 'employee', 'viewer']));
CREATE POLICY "Employee Edit Metadata" ON "customer_metadata" FOR UPDATE USING (public.check_user_role(ARRAY['admin', 'employee']));

-- CUSTOMER NOTES
CREATE POLICY "Admin Full Access Notes" ON "customer_notes" FOR ALL USING (public.check_user_role(ARRAY['admin']));
CREATE POLICY "Employee View Notes" ON "customer_notes" FOR SELECT USING (public.check_user_role(ARRAY['admin', 'employee', 'viewer']));
CREATE POLICY "Employee Insert Notes" ON "customer_notes" FOR INSERT WITH CHECK (public.check_user_role(ARRAY['admin', 'employee']));

-- CUSTOMER TAGS
CREATE POLICY "Admin Full Access Tags" ON "customer_tags" FOR ALL USING (public.check_user_role(ARRAY['admin']));
CREATE POLICY "Employee View Tags" ON "customer_tags" FOR SELECT USING (public.check_user_role(ARRAY['admin', 'employee', 'viewer']));

-- ACTIVITY LOGS
CREATE POLICY "View Activity Logs" ON "activity_logs" FOR SELECT USING (public.check_user_role(ARRAY['admin', 'employee']));
CREATE POLICY "Insert Activity Logs" ON "activity_logs" FOR INSERT WITH CHECK (auth.uid() = user_id);
