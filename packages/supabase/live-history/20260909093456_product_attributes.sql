-- Product attributes — merchant-defined taxonomy so the flagship template
-- serves any niche. See docs/plans/FLAGSHIP_TEMPLATE_PROGRAM.md §D1 and
-- packages/supabase/migrations/20260909130000_product_attributes.sql.

CREATE TABLE IF NOT EXISTS public.product_attribute_defs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    key          text NOT NULL,
    name_i18n    jsonb NOT NULL DEFAULT '{}'::jsonb,
    kind         text NOT NULL,
    options      jsonb,
    group_keys   jsonb,
    range_min    numeric,
    range_max    numeric,
    unit_i18n    jsonb,
    is_filterable boolean NOT NULL DEFAULT true,
    is_comparable boolean NOT NULL DEFAULT false,
    display_order smallint NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_attribute_defs_key_format
      CHECK (key ~ '^[a-z][a-z0-9_]{0,62}$'),
    CONSTRAINT product_attribute_defs_kind_valid
      CHECK (kind IN ('enum', 'range', 'group_list', 'text', 'boolean')),
    CONSTRAINT product_attribute_defs_shape_matches_kind CHECK (
      CASE kind
        WHEN 'enum'       THEN jsonb_typeof(options) = 'array' AND jsonb_array_length(options) > 0
        WHEN 'group_list' THEN jsonb_typeof(group_keys) = 'array' AND jsonb_array_length(group_keys) > 0
        WHEN 'range'      THEN range_min IS NOT NULL AND range_max IS NOT NULL AND range_max > range_min
        ELSE true
      END
    ),
    CONSTRAINT product_attribute_defs_tenant_key_unique UNIQUE (tenant_id, key)
);

COMMENT ON TABLE public.product_attribute_defs IS
  'Per-tenant product attribute taxonomy. `kind` selects both the value shape and the storefront renderer.';
COMMENT ON COLUMN public.product_attribute_defs.key IS
  'Stable ASCII slug. Used in facet URLs and as a section prop key — never localised.';
COMMENT ON COLUMN public.product_attribute_defs.is_comparable IS
  'Include this attribute when scoring product similarity ("similar to this").';

CREATE INDEX IF NOT EXISTS idx_product_attribute_defs_tenant_order
  ON public.product_attribute_defs (tenant_id, display_order, key);

CREATE TABLE IF NOT EXISTS public.product_attribute_values (
    product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    attribute_def_id  uuid NOT NULL REFERENCES public.product_attribute_defs(id) ON DELETE CASCADE,
    tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    value             jsonb NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (product_id, attribute_def_id)
);

COMMENT ON TABLE public.product_attribute_values IS
  'Per-product attribute values. `value` shape is determined by the definition''s `kind`.';

CREATE INDEX IF NOT EXISTS idx_product_attribute_values_tenant_def
  ON public.product_attribute_values (tenant_id, attribute_def_id);
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_value
  ON public.product_attribute_values USING gin (value jsonb_path_ops);

CREATE OR REPLACE FUNCTION public.tg_product_attribute_values_tenant_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_product_tenant uuid;
  v_def_tenant     uuid;
BEGIN
  SELECT tenant_id INTO v_product_tenant FROM public.products WHERE id = NEW.product_id;
  SELECT tenant_id INTO v_def_tenant FROM public.product_attribute_defs WHERE id = NEW.attribute_def_id;

  IF v_product_tenant IS NULL OR v_def_tenant IS NULL THEN
    RAISE EXCEPTION 'product or attribute definition not found';
  END IF;

  IF v_product_tenant <> v_def_tenant THEN
    RAISE EXCEPTION 'attribute definition % belongs to a different tenant than product %',
      NEW.attribute_def_id, NEW.product_id;
  END IF;

  NEW.tenant_id := v_product_tenant;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_attribute_values_tenant_guard ON public.product_attribute_values;
CREATE TRIGGER trg_product_attribute_values_tenant_guard
  BEFORE INSERT OR UPDATE ON public.product_attribute_values
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_attribute_values_tenant_guard();

CREATE OR REPLACE FUNCTION public.tg_product_attribute_defs_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_attribute_defs_updated_at ON public.product_attribute_defs;
CREATE TRIGGER trg_product_attribute_defs_updated_at
  BEFORE UPDATE ON public.product_attribute_defs
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_attribute_defs_updated_at();

ALTER TABLE public.product_attribute_defs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attribute_values ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_isolation_all" ON public.product_attribute_defs;
CREATE POLICY "tenant_isolation_all" ON public.product_attribute_defs
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "tenant_isolation_all" ON public.product_attribute_values;
CREATE POLICY "tenant_isolation_all" ON public.product_attribute_values
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS "public_storefront_read" ON public.product_attribute_defs;
CREATE POLICY "public_storefront_read" ON public.product_attribute_defs
  FOR SELECT TO anon, authenticated
  USING (
    tenant_id IN (SELECT id FROM public.tenants WHERE status IN ('trial', 'active'))
  );

DROP POLICY IF EXISTS "public_storefront_read" ON public.product_attribute_values;
CREATE POLICY "public_storefront_read" ON public.product_attribute_values
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.products p
        JOIN public.tenants  t ON t.id = p.tenant_id
       WHERE p.id = product_attribute_values.product_id
         AND p.is_visible = true
         AND p.is_archived = false
         AND p.is_supply IS NOT TRUE
         AND t.status IN ('trial', 'active')
    )
  );

GRANT SELECT ON public.product_attribute_defs   TO anon, authenticated;
GRANT SELECT ON public.product_attribute_values TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_attribute_defs   TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_attribute_values TO authenticated;;
