-- =============================================
-- Add store_config JSONB to tenants
-- Holds template selection, hero section, social links,
-- and storefront behavior flags.
-- =============================================

ALTER TABLE public.tenants
    ADD COLUMN IF NOT EXISTS store_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill existing tenants with sensible defaults
UPDATE public.tenants
SET store_config = jsonb_build_object(
    'template', 'general',
    'hero', jsonb_build_object(
        'title', business_name,
        'subtitle', '',
        'cta_text', 'تسوق الآن',
        'image_url', NULL
    ),
    'contact', jsonb_build_object(
        'whatsapp_number', contact_phone,
        'instagram', NULL,
        'facebook', NULL,
        'tiktok', NULL
    ),
    'about', jsonb_build_object(
        'enabled', false,
        'title', 'من نحن',
        'body', ''
    ),
    'sections_order', '["hero","products","categories","about"]'::jsonb,
    'enable_whatsapp_order', true
)
WHERE store_config = '{}'::jsonb OR store_config IS NULL;

NOTIFY pgrst, 'reload schema';
