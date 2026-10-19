-- The eight product tables the platform has always written to but which
-- never existed. See packages/supabase/migrations/20260909150000_product_editor_missing_tables.sql
-- for the full rationale. Read access is split: four are public commerce
-- data, four hold margin/operational history and stay members-only —
-- product_suppliers.unit_cost must never be anon-readable.

CREATE TABLE IF NOT EXISTS public.product_tiered_pricing (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tenant_id     uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    min_quantity  integer NOT NULL CHECK (min_quantity > 0),
    max_quantity  integer CHECK (max_quantity IS NULL OR max_quantity >= min_quantity),
    price         numeric NOT NULL CHECK (price >= 0),
    created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.product_tiered_pricing IS 'Quantity price breaks. max_quantity NULL = open-ended top tier.';
CREATE INDEX IF NOT EXISTS idx_product_tiered_pricing_product ON public.product_tiered_pricing (product_id, min_quantity);

CREATE TABLE IF NOT EXISTS public.product_order_bumps (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id          uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tenant_id           uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    bump_product_id     uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    discount_percentage numeric NOT NULL DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
    headline            text,
    description         text,
    display_order       integer NOT NULL DEFAULT 0,
    is_active           boolean NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_order_bumps_not_self CHECK (bump_product_id <> product_id)
);
COMMENT ON TABLE public.product_order_bumps IS 'Add-on offers shown with a product at checkout.';
CREATE INDEX IF NOT EXISTS idx_product_order_bumps_product ON public.product_order_bumps (product_id, display_order);

CREATE TABLE IF NOT EXISTS public.product_related (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id         uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tenant_id          uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    related_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    relation_type      text NOT NULL DEFAULT 'related',
    display_order      integer NOT NULL DEFAULT 0,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_related_not_self CHECK (related_product_id <> product_id)
);
CREATE INDEX IF NOT EXISTS idx_product_related_product ON public.product_related (product_id, display_order);

CREATE TABLE IF NOT EXISTS public.product_bundle_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id       uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tenant_id        uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    child_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity         integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
    display_order    integer NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT product_bundle_items_not_self CHECK (child_product_id <> product_id)
);
CREATE INDEX IF NOT EXISTS idx_product_bundle_items_product ON public.product_bundle_items (product_id, display_order);

CREATE TABLE IF NOT EXISTS public.product_suppliers (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id             uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tenant_id              uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    supplier_name          text NOT NULL,
    supplier_contact       text,
    supplier_email         text,
    lead_time_days         integer,
    minimum_order_quantity integer,
    unit_cost              numeric,
    notes                  text,
    is_primary             boolean NOT NULL DEFAULT false,
    created_at             timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.product_suppliers.unit_cost IS 'Supplier cost — commercially sensitive. Members only; never grant to anon.';
CREATE INDEX IF NOT EXISTS idx_product_suppliers_product ON public.product_suppliers (product_id);

CREATE TABLE IF NOT EXISTS public.inventory_history (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id      uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tenant_id       uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    change_type     text NOT NULL,
    quantity_change integer NOT NULL,
    quantity_before integer,
    quantity_after  integer,
    reference_id    text,
    notes           text,
    changed_by      text,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inventory_history_product ON public.inventory_history (product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.product_activity_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tenant_id    uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    action       text NOT NULL,
    changes_json jsonb,
    user_id      uuid,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_activity_log_product ON public.product_activity_log (product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.product_price_history (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tenant_id  uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    old_price  numeric,
    new_price  numeric NOT NULL,
    changed_by text,
    reason     text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_price_history_product ON public.product_price_history (product_id, created_at DESC);

DO $$
DECLARE
  t text;
  public_read text[] := ARRAY['product_tiered_pricing','product_order_bumps','product_related','product_bundle_items'];
  members_only text[] := ARRAY['product_suppliers','inventory_history','product_activity_log','product_price_history'];
BEGIN
  FOREACH t IN ARRAY public_read || members_only LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($f$
      DROP POLICY IF EXISTS "tenant_isolation_all" ON public.%I;
      CREATE POLICY "tenant_isolation_all" ON public.%I
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
        WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));
    $f$, t, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;

  FOREACH t IN ARRAY public_read LOOP
    EXECUTE format($f$
      DROP POLICY IF EXISTS "public_storefront_read" ON public.%I;
      CREATE POLICY "public_storefront_read" ON public.%I
        FOR SELECT TO anon, authenticated
        USING (EXISTS (
          SELECT 1 FROM public.products p
            JOIN public.tenants tn ON tn.id = p.tenant_id
           WHERE p.id = %I.product_id
             AND p.is_visible = true
             AND p.is_archived = false
             AND p.is_supply IS NOT TRUE
             AND tn.status IN ('trial','active')
        ));
    $f$, t, t, t);
    EXECUTE format('GRANT SELECT ON public.%I TO anon', t);
  END LOOP;
END $$;;
