-- =====================================================================
-- The eight product tables the platform has always written to, but which
-- never existed
-- =====================================================================
-- `productRepository` reads and writes eight relations that are absent from
-- the database. Every one of them throws, and because the product editor
-- saves them together with `Promise.all`, the whole save rejects:
--
--   updateProduct()      succeeds — the product row IS written
--   saveRelatedData()    rejects on the first missing table
--   catch               → toast.error("Failed to save product"), return false
--
-- So every product save reports failure after having already saved, the
-- draft is never cleared, and the editor still shows unsaved changes. On
-- create it is worse: the product exists, but the success toast and the
-- redirect to its edit page never run, which invites a duplicate.
--
-- This creates the eight tables to the shape the repository already writes,
-- rather than deleting the features — two of them (order bumps, tiered
-- pricing) are approved roadmap work, and the rest back editor UI that is
-- already built and shipped.
--
-- READ ACCESS IS SPLIT DELIBERATELY. Four of these are public commerce data
-- the storefront must read; four contain margin and operational history and
-- stay members-only. `product_suppliers.unit_cost` is supplier cost — the
-- exact class of column that leaked once before (see the anon-read sweep of
-- 2026-08-17) and must never be anon-readable.
-- =====================================================================

-- ── Public commerce: readable by the storefront ──────────────────────

CREATE TABLE IF NOT EXISTS public.product_tiered_pricing (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tenant_id     uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    min_quantity  integer NOT NULL CHECK (min_quantity > 0),
    -- NULL means "and above" — the open-ended top tier.
    max_quantity  integer CHECK (max_quantity IS NULL OR max_quantity >= min_quantity),
    price         numeric NOT NULL CHECK (price >= 0),
    created_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.product_tiered_pricing IS
  'Quantity price breaks. max_quantity NULL = open-ended top tier.';
CREATE INDEX IF NOT EXISTS idx_product_tiered_pricing_product
  ON public.product_tiered_pricing (product_id, min_quantity);

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
    -- Offering a product as a bump on itself is always a mistake.
    CONSTRAINT product_order_bumps_not_self CHECK (bump_product_id <> product_id)
);
COMMENT ON TABLE public.product_order_bumps IS
  'Add-on offers shown with a product at checkout.';
CREATE INDEX IF NOT EXISTS idx_product_order_bumps_product
  ON public.product_order_bumps (product_id, display_order);

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
CREATE INDEX IF NOT EXISTS idx_product_related_product
  ON public.product_related (product_id, display_order);

CREATE TABLE IF NOT EXISTS public.product_bundle_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id       uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tenant_id        uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    child_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity         integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
    display_order    integer NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now(),
    -- A bundle containing itself would recurse forever when priced.
    CONSTRAINT product_bundle_items_not_self CHECK (child_product_id <> product_id)
);
CREATE INDEX IF NOT EXISTS idx_product_bundle_items_product
  ON public.product_bundle_items (product_id, display_order);

-- ── Internal: margin and operational history, members only ───────────

CREATE TABLE IF NOT EXISTS public.product_suppliers (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id             uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tenant_id              uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    supplier_name          text NOT NULL,
    supplier_contact       text,
    supplier_email         text,
    lead_time_days         integer,
    minimum_order_quantity integer,
    -- Supplier cost. NEVER exposed to anon — see the header.
    unit_cost              numeric,
    notes                  text,
    is_primary             boolean NOT NULL DEFAULT false,
    created_at             timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.product_suppliers.unit_cost IS
  'Supplier cost — commercially sensitive. Members only; never grant to anon.';
CREATE INDEX IF NOT EXISTS idx_product_suppliers_product
  ON public.product_suppliers (product_id);

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
CREATE INDEX IF NOT EXISTS idx_inventory_history_product
  ON public.inventory_history (product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.product_activity_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id   uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    tenant_id    uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    action       text NOT NULL,
    changes_json jsonb,
    user_id      uuid,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_product_activity_log_product
  ON public.product_activity_log (product_id, created_at DESC);

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
CREATE INDEX IF NOT EXISTS idx_product_price_history_product
  ON public.product_price_history (product_id, created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  t text;
  public_read text[] := ARRAY['product_tiered_pricing','product_order_bumps',
                              'product_related','product_bundle_items'];
  members_only text[] := ARRAY['product_suppliers','inventory_history',
                               'product_activity_log','product_price_history'];
BEGIN
  FOREACH t IN ARRAY public_read || members_only LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Members: full access within their own tenants. tenant_id is nullable
    -- here because the repository passes it through and legacy callers may
    -- not have one; a NULL row is visible to nobody, which is the safe way
    -- for that to fail.
    EXECUTE format($f$
      DROP POLICY IF EXISTS "tenant_isolation_all" ON public.%I;
      CREATE POLICY "tenant_isolation_all" ON public.%I
        FOR ALL TO authenticated
        USING (tenant_id IN (SELECT public.get_user_tenant_ids()))
        WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids()));
    $f$, t, t);

    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  END LOOP;

  -- Storefront read, and ONLY for rows whose product is itself public.
  -- Mirrors public_storefront_read_products, supplies carve-out included.
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
END $$;

-- A schema-wide default privilege grants SELECT to anon on every new table,
-- so the four internal tables came out anon-SELECTable despite the grants
-- above naming only the public four. RLS returns them zero rows (they carry
-- no anon policy), but table-level access must not depend on a policy
-- staying correct. Revoke explicitly.
REVOKE SELECT ON public.product_suppliers      FROM anon;
REVOKE SELECT ON public.inventory_history      FROM anon;
REVOKE SELECT ON public.product_activity_log   FROM anon;
REVOKE SELECT ON public.product_price_history  FROM anon;

REVOKE INSERT, UPDATE, DELETE ON public.product_suppliers      FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.inventory_history      FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_activity_log   FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_price_history  FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_tiered_pricing FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_order_bumps    FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_related        FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.product_bundle_items   FROM anon;
