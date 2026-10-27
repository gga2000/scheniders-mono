-- =====================================================================
-- scheniders-iraq — the occasions chip row says "when & where"
-- =====================================================================
-- Tenant data, not schema. 20261022130000 copied each product's «وين تحطه؟»
-- line into the `occasions` attribute. Those lines name times of day as
-- well as places — «مسائي» (from «شتوي ومسائي», «عطر مسائي») is a chip on
-- eight products — so
-- under the label «وين تحطه؟» ("where to wear it") a chip like «مسائي»
-- reads oddly. The values are the merchant's own words and stay as they
-- are; the label now covers both: «شوكت ووين تحطه؟» ("when & where to
-- wear it"). The express «رحلة العطر» block shows this label as the chip
-- row's heading.
--
-- Guarded on the exact label 20261022130000 wrote, so a label the merchant
-- has since edited is left alone. A no-op on any database without
-- scheniders-iraq. trg_product_attribute_defs_updated_at stamps updated_at.
-- RLS unchanged.
-- Rollback: set name_i18n back to
--   {"ar":"وين تحطه؟","en":"Where to wear it"}
-- on the same row (tenant scheniders-iraq, key occasions), guarded on the
-- new value.
-- =====================================================================

UPDATE public.product_attribute_defs d
   SET name_i18n = '{"ar":"شوكت ووين تحطه؟","en":"When & where to wear it"}'::jsonb
  FROM public.tenants t
 WHERE t.slug = 'scheniders-iraq'
   AND d.tenant_id = t.id
   AND d.key = 'occasions'
   AND d.name_i18n = '{"ar":"وين تحطه؟","en":"Where to wear it"}'::jsonb;
