-- =============================================
-- Enable tenant-scoped RLS on product_images
--
-- The product_images table was created via Supabase Studio without policies
-- that reference tenant_members, so the 20260406200001 recursion-fix migration
-- skipped it. Authenticated users get 42501 (row-level security violation) on
-- INSERT because no policy grants them access.
--
-- This migration aligns product_images with every other tenant-scoped table:
-- policies gate access through get_user_tenant_ids().
-- =============================================

-- Ensure RLS is enabled (idempotent)
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- Drop any pre-existing policies so we start clean
DO $$
DECLARE
  _policy_name text;
BEGIN
  FOR _policy_name IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'product_images'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.product_images', _policy_name);
  END LOOP;
END;
$$;

-- SELECT: any member of the tenant can read its product images
CREATE POLICY "product_images_tenant_select"
  ON public.product_images
  FOR SELECT
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- INSERT: new rows must belong to a tenant the caller is a member of
CREATE POLICY "product_images_tenant_insert"
  ON public.product_images
  FOR INSERT
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

-- UPDATE: same on both sides so a member cannot reassign rows to another tenant
CREATE POLICY "product_images_tenant_update"
  ON public.product_images
  FOR UPDATE
  USING (tenant_id IN (SELECT get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));

-- DELETE: only members of the tenant can delete its product images
CREATE POLICY "product_images_tenant_delete"
  ON public.product_images
  FOR DELETE
  USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- Public (anon) read so the storefront can render product galleries
CREATE POLICY "product_images_public_read"
  ON public.product_images
  FOR SELECT
  TO anon
  USING (true);

NOTIFY pgrst, 'reload schema';
