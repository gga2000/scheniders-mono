-- =====================================================================
-- Product attributes — the flagship template's keystone
-- =====================================================================
-- The store templates need to show things like a perfume's scent family,
-- its note pyramid and its longevity. Modelling those as perfume columns
-- would make the flagship template a perfume template. Modelling them as a
-- merchant-defined taxonomy makes the SAME sections serve a coffee roaster
-- (roast, origin, body), a fashion label (fabric, fit, care) or an
-- electronics shop (a spec table) with no code change.
--
-- Two tables:
--   product_attribute_defs   — what attributes exist, per tenant
--   product_attribute_values — what each product's values are
--
-- `kind` drives BOTH validation and presentation. A storefront section
-- renders one layout per kind (range → meters, group_list → pyramid,
-- enum → chips, …), so adding an attribute never needs a new section.
--
-- See docs/plans/FLAGSHIP_TEMPLATE_PROGRAM.md §D1.
-- =====================================================================

-- ── Taxonomy ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_attribute_defs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    -- Stable machine key. ASCII-only and lowercase: it is used in URLs
    -- (facet query params) and as an object key in section props, and the
    -- storage-key lesson applies — Arabic keys break both.
    key          text NOT NULL,

    -- Merchant-facing label, localised. Arabic-first market, so this is
    -- never a bare string.
    name_i18n    jsonb NOT NULL DEFAULT '{}'::jsonb,

    kind         text NOT NULL,

    -- kind='enum':       [{ "value": "oriental", "label_i18n": {...} }, …]
    -- kind='group_list': [{ "key": "top", "label_i18n": {...} }, …]
    options      jsonb,
    group_keys   jsonb,

    -- kind='range': the scale the meter is drawn against.
    range_min    numeric,
    range_max    numeric,
    unit_i18n    jsonb,

    -- Whether this attribute may drive a storefront facet, and whether it
    -- participates in "similar products" scoring.
    is_filterable boolean NOT NULL DEFAULT true,
    is_comparable boolean NOT NULL DEFAULT false,

    display_order smallint NOT NULL DEFAULT 0,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT product_attribute_defs_key_format
      CHECK (key ~ '^[a-z][a-z0-9_]{0,62}$'),
    CONSTRAINT product_attribute_defs_kind_valid
      CHECK (kind IN ('enum', 'range', 'group_list', 'text', 'boolean')),
    -- Each kind must carry the shape its renderer requires. Without this a
    -- half-configured attribute reaches the storefront and the section has
    -- to defend against it at render time.
    CONSTRAINT product_attribute_defs_shape_matches_kind CHECK (
      CASE kind
        WHEN 'enum'       THEN jsonb_typeof(options) = 'array'
                               AND jsonb_array_length(options) > 0
        WHEN 'group_list' THEN jsonb_typeof(group_keys) = 'array'
                               AND jsonb_array_length(group_keys) > 0
        WHEN 'range'      THEN range_min IS NOT NULL
                               AND range_max IS NOT NULL
                               AND range_max > range_min
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

-- ── Values ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_attribute_values (
    product_id        uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    attribute_def_id  uuid NOT NULL REFERENCES public.product_attribute_defs(id) ON DELETE CASCADE,

    -- Denormalised so every RLS policy and index here is tenant-scoped
    -- without a join back through products. Kept honest by the trigger
    -- below, which refuses a row whose product and definition disagree.
    tenant_id         uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    -- Shape follows the definition's `kind`:
    --   enum       "oriental"
    --   range      4.5
    --   boolean    true
    --   text       { "en": "...", "ar": "..." }
    --   group_list { "top": ["برغموت"], "heart": [...], "base": [...] }
    value             jsonb NOT NULL,

    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (product_id, attribute_def_id)
);

COMMENT ON TABLE public.product_attribute_values IS
  'Per-product attribute values. `value` shape is determined by the definition''s `kind`.';

-- Facet queries read "all values for this attribute in this tenant", then
-- intersect product ids; containment queries on `value` back enum/group filters.
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_tenant_def
  ON public.product_attribute_values (tenant_id, attribute_def_id);
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_value
  ON public.product_attribute_values USING gin (value jsonb_path_ops);

-- ── Integrity: value, product and definition must share one tenant ────
-- A denormalised tenant_id is only safe if it cannot drift. Enforced in a
-- trigger rather than a CHECK because it needs to read the other tables.
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
  SELECT tenant_id INTO v_product_tenant FROM public.products            WHERE id = NEW.product_id;
  SELECT tenant_id INTO v_def_tenant     FROM public.product_attribute_defs WHERE id = NEW.attribute_def_id;

  IF v_product_tenant IS NULL OR v_def_tenant IS NULL THEN
    RAISE EXCEPTION 'product or attribute definition not found';
  END IF;

  IF v_product_tenant <> v_def_tenant THEN
    RAISE EXCEPTION 'attribute definition % belongs to a different tenant than product %',
      NEW.attribute_def_id, NEW.product_id;
  END IF;

  -- Authoritative, so a client cannot label a row with someone else's tenant.
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
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_attribute_defs_updated_at ON public.product_attribute_defs;
CREATE TRIGGER trg_product_attribute_defs_updated_at
  BEFORE UPDATE ON public.product_attribute_defs
  FOR EACH ROW EXECUTE FUNCTION public.tg_product_attribute_defs_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.product_attribute_defs   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_attribute_values ENABLE ROW LEVEL SECURITY;

-- Members: full access to their own tenants (mirrors products).
CREATE POLICY "tenant_isolation_all" ON public.product_attribute_defs
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

CREATE POLICY "tenant_isolation_all" ON public.product_attribute_values
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));

-- Storefront: the taxonomy is public catalog structure — facet labels have
-- to render for logged-out visitors. Same shape as product_categories.
CREATE POLICY "public_storefront_read" ON public.product_attribute_defs
  FOR SELECT TO anon, authenticated
  USING (
    tenant_id IN (SELECT id FROM public.tenants WHERE status IN ('trial', 'active'))
  );

-- Values are only public for products that are themselves public. Mirrors
-- public_storefront_read_products exactly, including the supplies carve-out
-- — otherwise attributes would leak the existence of hidden products.
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
GRANT INSERT, UPDATE, DELETE ON public.product_attribute_values TO authenticated;

-- Trigger functions must not be reachable over PostgREST RPC. The tenant
-- guard is SECURITY DEFINER, so leaving it EXECUTE-able by anon is exactly
-- the shape of hole worth closing, even though calling it outside trigger
-- context would error anyway.
REVOKE EXECUTE ON FUNCTION public.tg_product_attribute_values_tenant_guard() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_product_attribute_defs_updated_at()     FROM PUBLIC, anon, authenticated;
