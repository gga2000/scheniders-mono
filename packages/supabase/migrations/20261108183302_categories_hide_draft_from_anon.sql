-- Visitors (anon) may read published categories, but never the unpublished
-- draft layout. Column grants: a new categories column is NOT readable by anon
-- until it is added here on purpose.
REVOKE SELECT ON public.categories FROM anon;
GRANT SELECT (id, tenant_id, parent_id, name, slug, description, image_url, display_order, is_visible, created_at, updated_at, status, published_at, unpublish_at, archived_at, banner_url, accent_color, icon, name_ar, name_en, description_ar, description_en, meta_title, meta_description, og_image_url, canonical_url, show_in_main_nav, show_in_mega_menu, show_in_mobile_drawer, nav_variant, page_config, landing_page_url, brand_id, scope, status_before_archive) ON public.categories TO anon