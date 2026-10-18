-- Categories Tab V2 — Phase 1: Core columns
ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'published',
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS unpublish_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'categories_status_check'
    ) THEN
        ALTER TABLE public.categories
            ADD CONSTRAINT categories_status_check
            CHECK (status IN ('draft', 'published', 'archived'));
    END IF;
END $$;

ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS banner_url TEXT,
    ADD COLUMN IF NOT EXISTS accent_color TEXT,
    ADD COLUMN IF NOT EXISTS icon TEXT;

ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS name_ar TEXT,
    ADD COLUMN IF NOT EXISTS name_en TEXT,
    ADD COLUMN IF NOT EXISTS description_ar TEXT,
    ADD COLUMN IF NOT EXISTS description_en TEXT;

ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS meta_title TEXT,
    ADD COLUMN IF NOT EXISTS meta_description TEXT,
    ADD COLUMN IF NOT EXISTS og_image_url TEXT,
    ADD COLUMN IF NOT EXISTS canonical_url TEXT;

ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS show_in_main_nav BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS show_in_mega_menu BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS show_in_mobile_drawer BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS nav_variant TEXT NOT NULL DEFAULT 'pills';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'categories_nav_variant_check'
    ) THEN
        ALTER TABLE public.categories
            ADD CONSTRAINT categories_nav_variant_check
            CHECK (nav_variant IN ('pills', 'cards', 'icons'));
    END IF;
END $$;

ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS page_config JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS page_config_draft JSONB;

ALTER TABLE public.categories
    ADD COLUMN IF NOT EXISTS landing_page_url TEXT,
    ADD COLUMN IF NOT EXISTS brand_id UUID;

CREATE INDEX IF NOT EXISTS idx_categories_tenant_status
    ON public.categories(tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_categories_tenant_publish_window
    ON public.categories(tenant_id, published_at, unpublish_at);

CREATE INDEX IF NOT EXISTS idx_categories_tenant_main_nav
    ON public.categories(tenant_id)
    WHERE show_in_main_nav = true AND status = 'published';

COMMENT ON COLUMN public.products.category_id IS
    'Primary category for canonical URL/SEO. Full M:N membership lives in product_categories.';

NOTIFY pgrst, 'reload schema';;
