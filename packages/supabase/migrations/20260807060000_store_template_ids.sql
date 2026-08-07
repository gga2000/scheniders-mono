-- =====================================================================
-- Repoint industries.recommended_template_id at the store templates
-- =====================================================================
-- The onboarding wizard used to offer five home-page-only packs
-- (sale_page, product_launch, brand_story, iraqi_market_landing,
-- minimal_catalog). Those are replaced by five full store templates that
-- also carry a brand kit. The application resolves the old ids through
-- LEGACY_TEMPLATE_ALIAS, so this migration is a data cleanup rather than
-- a correctness fix: it stops the wizard recommending a template by an
-- id that no longer appears in the picker.
--
-- Idempotent, and a no-op on databases where `industries` was never
-- created.
-- =====================================================================

do $$
begin
  if to_regclass('public.industries') is null then
    return;
  end if;

  update public.industries
  set recommended_template_id = case recommended_template_id
        when 'sale_page'             then 'sunbleach'
        when 'product_launch'        then 'aurora_glass'
        when 'brand_story'           then 'cobalt_broadsheet'
        when 'iraqi_market_landing'  then 'kinetic_ink'
        when 'minimal_catalog'       then 'chrome_night'
        else recommended_template_id
      end
  where recommended_template_id in (
    'sale_page',
    'product_launch',
    'brand_story',
    'iraqi_market_landing',
    'minimal_catalog'
  );
end
$$;
