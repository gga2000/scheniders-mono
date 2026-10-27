-- F-002 part 3 of 3 (see 20261020150100_product_child_tables_tenant_guard header).
-- Public read policies: same visibility bar as the product itself, and the
-- row must be its product's tenant's. ALTER POLICY keeps each policy's name,
-- command and roles and replaces only its USING clause.
ALTER POLICY public_storefront_read_product_images ON public.product_images
    TO public
    USING (EXISTS (
        SELECT 1
          FROM public.products p
          JOIN public.tenants tn ON tn.id = p.tenant_id
         WHERE p.id = product_images.product_id
           AND p.tenant_id = product_images.tenant_id
           AND p.is_visible = true
           AND p.is_archived = false
           AND p.is_supply IS NOT TRUE
           AND tn.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status])));

ALTER POLICY public_storefront_read_product_variants ON public.product_variants
    TO public
    USING (EXISTS (
        SELECT 1
          FROM public.products p
          JOIN public.tenants tn ON tn.id = p.tenant_id
         WHERE p.id = product_variants.product_id
           AND p.tenant_id = product_variants.tenant_id
           AND p.is_visible = true
           AND p.is_archived = false
           AND p.is_supply IS NOT TRUE
           AND tn.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status])));

ALTER POLICY public_storefront_read ON public.product_bundle_items
    TO anon, authenticated
    USING (EXISTS (
        SELECT 1
          FROM public.products p
          JOIN public.tenants tn ON tn.id = p.tenant_id
         WHERE p.id = product_bundle_items.product_id
           AND p.tenant_id = product_bundle_items.tenant_id
           AND p.is_visible = true
           AND p.is_archived = false
           AND p.is_supply IS NOT TRUE
           AND tn.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status])));

ALTER POLICY public_storefront_read ON public.product_related
    TO anon, authenticated
    USING (EXISTS (
        SELECT 1
          FROM public.products p
          JOIN public.tenants tn ON tn.id = p.tenant_id
         WHERE p.id = product_related.product_id
           AND p.tenant_id = product_related.tenant_id
           AND p.is_visible = true
           AND p.is_archived = false
           AND p.is_supply IS NOT TRUE
           AND tn.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status])));

ALTER POLICY public_storefront_read ON public.product_order_bumps
    TO anon, authenticated
    USING (EXISTS (
        SELECT 1
          FROM public.products p
          JOIN public.tenants tn ON tn.id = p.tenant_id
         WHERE p.id = product_order_bumps.product_id
           AND p.tenant_id = product_order_bumps.tenant_id
           AND p.is_visible = true
           AND p.is_archived = false
           AND p.is_supply IS NOT TRUE
           AND tn.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status])));

ALTER POLICY public_storefront_read ON public.product_tiered_pricing
    TO anon, authenticated
    USING (EXISTS (
        SELECT 1
          FROM public.products p
          JOIN public.tenants tn ON tn.id = p.tenant_id
         WHERE p.id = product_tiered_pricing.product_id
           AND p.tenant_id = product_tiered_pricing.tenant_id
           AND p.is_visible = true
           AND p.is_archived = false
           AND p.is_supply IS NOT TRUE
           AND tn.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status])));
