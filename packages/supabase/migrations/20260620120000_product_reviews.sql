-- =============================================
-- FEATURE: photo reviews — product_reviews table
--
-- Customer ratings + photos per product, moderated by the merchant before they
-- show on the storefront PDP. Submission goes through a trusted server action
-- (service role) so there is NO anon INSERT policy; the public can only read
-- APPROVED reviews of live tenants. Members read/moderate their own.
-- =============================================

CREATE TABLE IF NOT EXISTS public.product_reviews (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id)  ON DELETE CASCADE,
    product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    rating      int  NOT NULL CHECK (rating BETWEEN 1 AND 5),
    title       text,
    body        text,
    author_name text,
    photo_urls  text[] NOT NULL DEFAULT '{}',
    status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product_approved
    ON public.product_reviews (product_id) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_product_reviews_tenant
    ON public.product_reviews (tenant_id);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- Members read every review of their tenant (moderation queue).
DROP POLICY IF EXISTS reviews_member_select ON public.product_reviews;
CREATE POLICY reviews_member_select ON public.product_reviews
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- Public storefront sees ONLY approved reviews of live (trial/active) tenants.
DROP POLICY IF EXISTS reviews_public_read ON public.product_reviews;
CREATE POLICY reviews_public_read ON public.product_reviews
    FOR SELECT
    USING (
        status = 'approved'
        AND EXISTS (SELECT 1 FROM public.tenants t
                    WHERE t.id = product_reviews.tenant_id
                      AND t.status IN ('trial', 'active'))
    );

-- Members moderate (approve/reject/edit) + delete their own reviews.
DROP POLICY IF EXISTS reviews_member_update ON public.product_reviews;
CREATE POLICY reviews_member_update ON public.product_reviews
    FOR UPDATE TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
    WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS reviews_member_delete ON public.product_reviews;
CREATE POLICY reviews_member_delete ON public.product_reviews
    FOR DELETE TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

NOTIFY pgrst, 'reload schema';
