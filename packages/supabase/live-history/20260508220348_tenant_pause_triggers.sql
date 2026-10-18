-- =============================================
-- Postgres triggers that enforce tenant pause blocks
-- where client-side direct Supabase calls bypass server route guards.
-- Specifically: new_products (products table) and
-- storefront_writes (tenants.branding / tenants.store_config).
-- =============================================

CREATE OR REPLACE FUNCTION public.tenant_block_active(
    p_tenant_id UUID,
    p_block TEXT
) RETURNS BOOLEAN AS $$
DECLARE
    v_status TEXT;
    v_restrictions JSONB;
    v_paused_until TIMESTAMPTZ;
BEGIN
    SELECT status::TEXT, restrictions
      INTO v_status, v_restrictions
      FROM public.tenants
     WHERE id = p_tenant_id;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    IF v_status <> 'limited' THEN
        RETURN FALSE;
    END IF;

    -- Auto-allow when the pause window has elapsed; the platform code
    -- will flip the status back on next access.
    BEGIN
        v_paused_until := (v_restrictions ->> 'paused_until')::TIMESTAMPTZ;
    EXCEPTION WHEN OTHERS THEN
        v_paused_until := NULL;
    END;
    IF v_paused_until IS NOT NULL AND v_paused_until < now() THEN
        RETURN FALSE;
    END IF;

    RETURN COALESCE(
        (v_restrictions -> 'blocks' ->> p_block)::BOOLEAN,
        FALSE
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

-- ── Products: block INSERT and UPDATE when new_products is on ─────────
CREATE OR REPLACE FUNCTION public.enforce_product_block()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id IS NOT NULL
       AND public.tenant_block_active(NEW.tenant_id, 'new_products') THEN
        RAISE EXCEPTION
          'Tenant is paused — product changes are blocked'
          USING ERRCODE = 'P0001',
                HINT = 'TENANT_PAUSED:new_products';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_product_block ON public.products;
CREATE TRIGGER trg_enforce_product_block
    BEFORE INSERT OR UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.enforce_product_block();

-- ── Tenants: block UPDATE that touches branding/store_config ──────────
CREATE OR REPLACE FUNCTION public.enforce_storefront_writes_block()
RETURNS TRIGGER AS $$
DECLARE
    v_changed BOOLEAN := FALSE;
BEGIN
    -- Only fire when storefront-related columns actually changed.
    IF NEW.branding IS DISTINCT FROM OLD.branding THEN
        v_changed := TRUE;
    END IF;
    IF NEW.store_config IS DISTINCT FROM OLD.store_config THEN
        v_changed := TRUE;
    END IF;

    IF v_changed
       AND public.tenant_block_active(NEW.id, 'storefront_writes') THEN
        RAISE EXCEPTION
          'Tenant is paused — storefront edits are blocked'
          USING ERRCODE = 'P0001',
                HINT = 'TENANT_PAUSED:storefront_writes';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_enforce_storefront_writes_block ON public.tenants;
CREATE TRIGGER trg_enforce_storefront_writes_block
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.enforce_storefront_writes_block();;
