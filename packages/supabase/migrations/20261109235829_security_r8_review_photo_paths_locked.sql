-- Security round 8 (R6-01, R6-02): review photo paths can only ever be the
-- exact shape the storefront upload writes, inside the review's own store
-- folder, and staff can only change a review's status.

CREATE OR REPLACE FUNCTION public.review_photo_paths_ok(p_tenant_id uuid, p_paths text[])
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $function$
    SELECT coalesce(bool_and(
        p ~ ('^' || p_tenant_id::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
    ), true)
    FROM unnest(p_paths) AS p;
$function$;

ALTER TABLE public.product_reviews
    ADD CONSTRAINT product_reviews_photo_paths_safe
    CHECK (public.review_photo_paths_ok(tenant_id, photo_paths));

-- Staff moderate reviews (status) and delete them; nothing else is client-writable.
REVOKE UPDATE ON public.product_reviews FROM anon, authenticated;
GRANT UPDATE (status) ON public.product_reviews TO authenticated;

-- Membership-only policies let any member (viewer included) edit or delete;
-- the products.edit role policies stay.
DROP POLICY IF EXISTS reviews_member_update ON public.product_reviews;
DROP POLICY IF EXISTS reviews_member_delete ON public.product_reviews;
