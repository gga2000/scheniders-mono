-- The setup wizard marks one look «موصى به» from industries.recommended_template_id.
-- Every trade pointed at one of the August looks, which carry stock perfume
-- photos or claims a new shop cannot back (a 30% sale, press logos, a founding
-- year). New shops now open on the Soft look (soft_light, apps/platform
-- lib/store-templates/soft-light.ts), so the wizard recommends it for every
-- trade too. Only the wizard reads this column; no store's look changes.
UPDATE public.industries
SET recommended_template_id = 'soft_light'
WHERE recommended_template_id IS DISTINCT FROM 'soft_light';
