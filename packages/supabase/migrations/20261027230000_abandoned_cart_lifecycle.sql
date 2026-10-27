-- =============================================
-- FEATURE: abandoned-cart lifecycle on orders
--
-- An abandoned cart (AC) is an order with status 'pending_checkout'
-- (LightFunnels checkouts). Until now:
--   * "the customer came back and ordered" was checked only on the
--     LightFunnels webhook, by exact phone text, so `07…` and `+964…` for the
--     same customer never matched, and WhatsApp / manual / Meta / storefront
--     orders never closed an open AC;
--   * once staff moved an AC on, the only trace of where it came from was the
--     editable notes prefix «[سلة متروكة]»;
--   * junk ACs (no usable phone, no location) and stale ACs stayed forever.
--
-- This migration moves every rule into the database, so it holds for every
-- path that writes orders:
--   abandoned_cart_at         when the order was captured as an AC; never cleared.
--   abandoned_cart_outcome    NULL while open, then:
--       contacted        staff moved it out of Abandoned (any next status)
--       returned         the customer placed a real order themselves; also set
--                        on that real order, which inherits abandoned_cart_at
--       already_ordered  the AC arrived after a real order (24 h) for the phone
--       junk_phone       not a reachable Iraqi mobile
--       junk_location    no governorate, city or address at all
--       expired          untouched for 14 days (sweep_abandoned_carts)
--       kept             staff restored it from the trash; never swept again
--   abandoned_cart_resolved_at / _by_name   when, and by whom (staff name).
--   abandoned_cart_order_id   links an AC and the real order that replaced it.
--
-- Phones are matched with public.normalize_phone (07…, +964…, 964… -> 7…).
-- Removed ACs are soft-deleted (deleted_at), so they sit in the existing
-- 30-day trash and can be restored. The columns are written only by the
-- triggers below and by sweep_abandoned_carts; a member's UPDATE cannot set
-- them (orders RLS still decides which rows a member can touch at all).
-- =============================================

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS abandoned_cart_at timestamptz,
    ADD COLUMN IF NOT EXISTS abandoned_cart_outcome text,
    ADD COLUMN IF NOT EXISTS abandoned_cart_resolved_at timestamptz,
    ADD COLUMN IF NOT EXISTS abandoned_cart_resolved_by_name text,
    ADD COLUMN IF NOT EXISTS abandoned_cart_order_id uuid
        REFERENCES public.orders(id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.orders'::regclass
          AND conname = 'orders_abandoned_cart_outcome_check'
    ) THEN
        ALTER TABLE public.orders
            ADD CONSTRAINT orders_abandoned_cart_outcome_check
            CHECK (abandoned_cart_outcome IN (
                'contacted', 'returned', 'already_ordered',
                'junk_phone', 'junk_location', 'expired', 'kept'));
    END IF;
END $$;

COMMENT ON COLUMN public.orders.abandoned_cart_at IS
    'When this order was captured as an abandoned cart (pending_checkout). NULL = never was one. Trigger-written.';
COMMENT ON COLUMN public.orders.abandoned_cart_outcome IS
    'NULL while the cart is open; contacted | returned | already_ordered | junk_phone | junk_location | expired | kept. Trigger-written.';
COMMENT ON COLUMN public.orders.abandoned_cart_order_id IS
    'The real order that replaced this cart, or (on that real order) the cart it replaced.';

-- Phone lookups per tenant, among live orders (the triggers below).
CREATE INDEX IF NOT EXISTS idx_orders_tenant_phone_key_live
    ON public.orders (tenant_id, public.normalize_phone(phone))
    WHERE deleted_at IS NULL;

-- The recovery strip and the "From abandoned carts" filter.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_abandoned_cart_at
    ON public.orders (tenant_id, abandoned_cart_at DESC)
    WHERE abandoned_cart_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Internal-write switch. The guard trigger lets abandoned_cart_* change only
-- while this transaction-local setting is on; only the functions in this file
-- turn it on, and they turn it off again before returning.
-- ---------------------------------------------------------------------------

-- Junk reason for a cart, or NULL when it is a usable lead.
CREATE OR REPLACE FUNCTION public.abandoned_cart_junk_reason(
    _phone text, _governorate_code text, _city text, _address text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $function$
    SELECT CASE
        WHEN coalesce(public.normalize_phone(_phone), '') !~ '^7[0-9]{9}$' THEN 'junk_phone'
        WHEN _governorate_code IS NULL
             AND coalesce(btrim(_city), '') = ''
             AND coalesce(btrim(_address), '') = '' THEN 'junk_location'
        ELSE NULL
    END;
$function$;

-- BEFORE INSERT: stamp a new cart, and send junk / already-ordered carts
-- straight to the trash.
CREATE OR REPLACE FUNCTION public.orders_abandoned_cart_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    _junk text;
    _real uuid;
BEGIN
    -- Never trust caller-supplied values for these columns.
    NEW.abandoned_cart_at := NULL;
    NEW.abandoned_cart_outcome := NULL;
    NEW.abandoned_cart_resolved_at := NULL;
    NEW.abandoned_cart_resolved_by_name := NULL;
    NEW.abandoned_cart_order_id := NULL;

    IF NEW.status IS DISTINCT FROM 'pending_checkout' OR NEW.tenant_id IS NULL THEN
        RETURN NEW;
    END IF;

    NEW.abandoned_cart_at := coalesce(NEW.created_at, now());
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    _junk := public.abandoned_cart_junk_reason(
        NEW.phone, NEW.governorate_code, NEW.city, NEW.address_details);
    IF _junk IS NOT NULL THEN
        NEW.deleted_at := now();
        NEW.abandoned_cart_outcome := _junk;
        NEW.abandoned_cart_resolved_at := now();
        RETURN NEW;
    END IF;

    -- The customer already ordered in the last 24 h: this checkout is the
    -- leftover of that order, not a lead.
    SELECT o.id INTO _real
    FROM public.orders o
    WHERE o.tenant_id = NEW.tenant_id
      AND o.deleted_at IS NULL
      AND public.normalize_phone(o.phone) = public.normalize_phone(NEW.phone)
      AND o.status <> 'pending_checkout'
      AND o.created_at >= now() - interval '24 hours'
    ORDER BY o.created_at DESC
    LIMIT 1;

    IF _real IS NOT NULL THEN
        NEW.deleted_at := now();
        NEW.abandoned_cart_outcome := 'already_ordered';
        NEW.abandoned_cart_resolved_at := now();
        NEW.abandoned_cart_order_id := _real;
    END IF;

    RETURN NEW;
END;
$function$;

-- AFTER INSERT: a real order resolves the same customer's open carts.
CREATE OR REPLACE FUNCTION public.orders_abandoned_cart_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    _key text;
    _first_at timestamptz;
    _latest uuid;
BEGIN
    IF NEW.status = 'pending_checkout'
       OR NEW.deleted_at IS NOT NULL
       OR NEW.tenant_id IS NULL
       OR coalesce(NEW.is_return, false)
       OR coalesce(NEW.is_replacement, false) THEN
        RETURN NULL;
    END IF;

    _key := public.normalize_phone(NEW.phone);
    IF coalesce(_key, '') !~ '^7[0-9]{9}$' THEN
        RETURN NULL;
    END IF;

    PERFORM set_config('app.abandoned_cart_internal', 'on', true);

    WITH resolved AS (
        UPDATE public.orders c
        SET deleted_at = now(),
            abandoned_cart_outcome = 'returned',
            abandoned_cart_resolved_at = now(),
            abandoned_cart_order_id = NEW.id
        WHERE c.tenant_id = NEW.tenant_id
          AND c.deleted_at IS NULL
          AND c.status = 'pending_checkout'
          AND c.id <> NEW.id
          AND public.normalize_phone(c.phone) = _key
        RETURNING c.id, c.abandoned_cart_at
    )
    SELECT min(r.abandoned_cart_at),
           (array_agg(r.id ORDER BY r.abandoned_cart_at DESC))[1]
    INTO _first_at, _latest
    FROM resolved r;

    IF _latest IS NOT NULL THEN
        UPDATE public.orders
        SET abandoned_cart_at = _first_at,
            abandoned_cart_outcome = 'returned',
            abandoned_cart_resolved_at = now(),
            abandoned_cart_order_id = _latest
        WHERE id = NEW.id;
    END IF;

    -- Storefront phone captures for the same customer are recovered too.
    UPDATE public.abandoned_carts a
    SET recovered_at = now()
    WHERE a.tenant_id = NEW.tenant_id
      AND a.recovered_at IS NULL
      AND public.normalize_phone(a.phone) = _key;

    PERFORM set_config('app.abandoned_cart_internal', 'off', true);
    RETURN NULL;
END;
$function$;

-- BEFORE UPDATE: members cannot write abandoned_cart_*; a status move out of
-- Abandoned records who took the cart; a restore from the trash keeps it.
CREATE OR REPLACE FUNCTION public.orders_abandoned_cart_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
    _name text;
BEGIN
    IF current_setting('app.abandoned_cart_internal', true) = 'on' THEN
        RETURN NEW;
    END IF;

    NEW.abandoned_cart_at := OLD.abandoned_cart_at;
    NEW.abandoned_cart_outcome := OLD.abandoned_cart_outcome;
    NEW.abandoned_cart_resolved_at := OLD.abandoned_cart_resolved_at;
    NEW.abandoned_cart_resolved_by_name := OLD.abandoned_cart_resolved_by_name;
    NEW.abandoned_cart_order_id := OLD.abandoned_cart_order_id;

    -- Staff took the cart out of Abandoned.
    IF OLD.status = 'pending_checkout'
       AND NEW.status IS DISTINCT FROM 'pending_checkout'
       AND NEW.deleted_at IS NULL THEN
        _name := NULLIF(btrim(coalesce(NEW.last_status_changed_by_name, '')), '');
        IF _name IS NULL AND auth.uid() IS NOT NULL THEN
            SELECT NULLIF(btrim(coalesce(up.display_name, '')), '') INTO _name
            FROM public.user_profiles up WHERE up.id = auth.uid();
        END IF;
        NEW.abandoned_cart_at := coalesce(OLD.abandoned_cart_at, OLD.created_at);
        NEW.abandoned_cart_outcome := 'contacted';
        NEW.abandoned_cart_resolved_at := now();
        NEW.abandoned_cart_resolved_by_name := _name;
        RETURN NEW;
    END IF;

    -- An order moved back into Abandoned is an open cart again.
    IF NEW.status = 'pending_checkout'
       AND OLD.status IS DISTINCT FROM 'pending_checkout' THEN
        NEW.abandoned_cart_at := coalesce(OLD.abandoned_cart_at, now());
        NEW.abandoned_cart_outcome := NULL;
        NEW.abandoned_cart_resolved_at := NULL;
        NEW.abandoned_cart_resolved_by_name := NULL;
        RETURN NEW;
    END IF;

    -- Restored from the trash: staff want it, so the sweep leaves it alone.
    IF NEW.status = 'pending_checkout'
       AND OLD.deleted_at IS NOT NULL
       AND NEW.deleted_at IS NULL THEN
        NEW.abandoned_cart_at := coalesce(OLD.abandoned_cart_at, OLD.created_at);
        NEW.abandoned_cart_outcome := 'kept';
        NEW.abandoned_cart_resolved_at := NULL;
        NEW.abandoned_cart_resolved_by_name := NULL;
        NEW.abandoned_cart_order_id := NULL;
    END IF;

    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_abandoned_cart_before_insert ON public.orders;
CREATE TRIGGER trg_orders_abandoned_cart_before_insert
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_abandoned_cart_before_insert();

DROP TRIGGER IF EXISTS trg_orders_abandoned_cart_after_insert ON public.orders;
CREATE TRIGGER trg_orders_abandoned_cart_after_insert
    AFTER INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_abandoned_cart_after_insert();

DROP TRIGGER IF EXISTS trg_orders_abandoned_cart_before_update ON public.orders;
CREATE TRIGGER trg_orders_abandoned_cart_before_update
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_abandoned_cart_before_update();

REVOKE ALL ON FUNCTION public.orders_abandoned_cart_before_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orders_abandoned_cart_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.orders_abandoned_cart_before_update() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Daily sweep: junk rules for carts that predate them, then expiry. Only open
-- carts nobody has contacted and nobody restored (outcome NULL) are touched.
-- Returns one row per outcome written. Service role only (the cron route).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_abandoned_carts(
    _expire_after interval DEFAULT interval '14 days'
)
RETURNS TABLE (tenant_id uuid, outcome text, removed integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    IF _expire_after IS NULL OR _expire_after <= interval '0' THEN
        RAISE EXCEPTION 'sweep_abandoned_carts: _expire_after must be positive'
            USING ERRCODE = '22023';
    END IF;

    PERFORM set_config('app.abandoned_cart_internal', 'on', true);

    RETURN QUERY
    WITH swept AS (
        UPDATE public.orders o
        SET deleted_at = now(),
            abandoned_cart_at = coalesce(o.abandoned_cart_at, o.created_at),
            abandoned_cart_outcome = coalesce(
                public.abandoned_cart_junk_reason(o.phone, o.governorate_code, o.city, o.address_details),
                'expired'),
            abandoned_cart_resolved_at = now()
        WHERE o.status = 'pending_checkout'
          AND o.deleted_at IS NULL
          AND o.abandoned_cart_outcome IS NULL
          AND coalesce(o.contact_count, 0) = 0
          AND o.last_contacted_at IS NULL
          AND (
              public.abandoned_cart_junk_reason(o.phone, o.governorate_code, o.city, o.address_details) IS NOT NULL
              OR coalesce(o.abandoned_cart_at, o.created_at) < now() - _expire_after
          )
        RETURNING o.tenant_id, o.abandoned_cart_outcome
    )
    SELECT s.tenant_id, s.abandoned_cart_outcome, count(*)::integer
    FROM swept s
    GROUP BY s.tenant_id, s.abandoned_cart_outcome;

    PERFORM set_config('app.abandoned_cart_internal', 'off', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_abandoned_carts(interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_abandoned_carts(interval) TO service_role;

-- ---------------------------------------------------------------------------
-- A cart born in the trash (junk / already ordered) is not news: no
-- "order created" notification for it. Body otherwise unchanged.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_order_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_name TEXT; v_avatar TEXT;
BEGIN
    IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.deleted_at IS NOT NULL THEN RETURN NEW; END IF;

    SELECT actor_name, actor_avatar INTO v_name, v_avatar
    FROM public.resolve_order_creation_actor(NEW);

    INSERT INTO public.notifications (
        tenant_id, type, category, audience, actor_name, actor_avatar,
        entity_type, entity_id, entity_label, payload, group_key
    ) VALUES (
        NEW.tenant_id, 'order.created', 'orders', 'tenant', v_name, v_avatar,
        'order', NEW.id, '#' || NEW.order_id,
        jsonb_build_object('new_status', NEW.status),
        'order:' || NEW.id::text
    );

    RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Backfill. Triggers are off for these statements so old orders keep their
-- updated_at / version and no notifications, inventory or chat events fire.
-- Open carts get their capture time; orders staff moved out of Abandoned
-- (order_status_history) get outcome 'contacted' with the first move's time
-- and actor. Today's open carts are NOT removed here: the one-time cleanup
-- runs sweep_abandoned_carts after the owner has reviewed the list.
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders DISABLE TRIGGER USER;

UPDATE public.orders
SET abandoned_cart_at = created_at
WHERE status = 'pending_checkout'
  AND abandoned_cart_at IS NULL;

WITH first_move AS (
    SELECT DISTINCT ON (h.order_id)
        h.order_id, h.changed_at, h.changed_by
    FROM public.order_status_history h
    WHERE h.from_status = 'pending_checkout'
      AND h.to_status IS DISTINCT FROM 'pending_checkout'
    ORDER BY h.order_id, h.changed_at
)
UPDATE public.orders o
SET abandoned_cart_at = o.created_at,
    abandoned_cart_outcome = CASE WHEN o.status = 'pending_checkout' THEN NULL ELSE 'contacted' END,
    abandoned_cart_resolved_at = CASE WHEN o.status = 'pending_checkout' THEN NULL ELSE f.changed_at END,
    abandoned_cart_resolved_by_name = CASE
        WHEN o.status = 'pending_checkout' THEN NULL
        ELSE NULLIF(NULLIF(btrim(coalesce(f.changed_by, '')), ''), 'System')
    END
FROM first_move f
WHERE f.order_id = o.id;

ALTER TABLE public.orders ENABLE TRIGGER USER;

NOTIFY pgrst, 'reload schema';
