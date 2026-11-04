-- Shop Till, phase 0 (Ali approved the build plan 2026-11-04): physical shops,
-- which staff work in each shop, a 4-digit cashier PIN, and the store's till
-- rules. Nothing sells yet; phase 1 adds the sale itself.
--
-- shops          one row per physical shop of a store.
-- shop_staff     who works in which shop (a person can work in several).
-- till_settings  one row per store: discount limit, pay later limit, commission,
--                return window, idle lock, receipt defaults.
-- till_pins      a scrambled PIN per store member. No browser role can read it;
--                it is set and checked only through the functions below.
--
-- Permissions: shops.manage (owner screen), till.sell, till.discount,
-- till.refund, till.shift. Store admins hold all of them (has_tenant_permission).

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO public.role_permissions (role, permission) VALUES
    ('admin', 'shops.manage'), ('admin', 'till.sell'), ('admin', 'till.discount'),
    ('admin', 'till.refund'), ('admin', 'till.shift'),
    ('employee', 'till.sell'), ('employee', 'till.discount'), ('employee', 'till.shift')
ON CONFLICT (role, permission) DO NOTHING;

-- ---------------------------------------------------------------------------
-- shops
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shops (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name            text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
    address         text CHECK (address IS NULL OR char_length(address) <= 200),
    phone           text CHECK (phone IS NULL OR phone ~ '^07[0-9]{9}$'),
    receipt_footer  text CHECK (receipt_footer IS NULL OR char_length(receipt_footer) <= 200),
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS shops_tenant_name_key
    ON public.shops (tenant_id, lower(btrim(name)));

ALTER TABLE public.shops ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shops_select ON public.shops;
CREATE POLICY shops_select ON public.shops
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS shops_insert ON public.shops;
CREATE POLICY shops_insert ON public.shops
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids())
                AND public.has_tenant_permission(tenant_id, 'shops.manage'));

DROP POLICY IF EXISTS shops_update ON public.shops;
CREATE POLICY shops_update ON public.shops
    FOR UPDATE TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids())
           AND public.has_tenant_permission(tenant_id, 'shops.manage'))
    WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids())
                AND public.has_tenant_permission(tenant_id, 'shops.manage'));

-- No DELETE policy: a shop with sales must keep its history, so shops are
-- switched off (is_active = false), never deleted.

REVOKE ALL ON public.shops FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.shops TO authenticated;

CREATE OR REPLACE FUNCTION public.shops_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION 'a shop cannot move to another store' USING ERRCODE = '42501';
    END IF;
    NEW.name := btrim(NEW.name);
    NEW.updated_at := now();
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_shops_guard ON public.shops;
CREATE TRIGGER trg_shops_guard
    BEFORE INSERT OR UPDATE ON public.shops
    FOR EACH ROW EXECUTE FUNCTION public.shops_guard();

-- ---------------------------------------------------------------------------
-- shop_staff
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shop_staff (
    shop_id     uuid NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    created_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (shop_id, user_id)
);

CREATE INDEX IF NOT EXISTS shop_staff_tenant_user_idx ON public.shop_staff (tenant_id, user_id);

ALTER TABLE public.shop_staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS shop_staff_select ON public.shop_staff;
CREATE POLICY shop_staff_select ON public.shop_staff
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS shop_staff_insert ON public.shop_staff;
CREATE POLICY shop_staff_insert ON public.shop_staff
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids())
                AND public.has_tenant_permission(tenant_id, 'shops.manage'));

DROP POLICY IF EXISTS shop_staff_delete ON public.shop_staff;
CREATE POLICY shop_staff_delete ON public.shop_staff
    FOR DELETE TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids())
           AND public.has_tenant_permission(tenant_id, 'shops.manage'));

REVOKE ALL ON public.shop_staff FROM anon;
GRANT SELECT, INSERT, DELETE ON public.shop_staff TO authenticated;

-- The row's store is the shop's store, and the person is an active member of it.
CREATE OR REPLACE FUNCTION public.shop_staff_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_tenant uuid;
BEGIN
    SELECT s.tenant_id INTO v_tenant FROM public.shops s WHERE s.id = NEW.shop_id;
    IF v_tenant IS NULL OR v_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'shop belongs to another store' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.tenant_members tm
         WHERE tm.tenant_id = NEW.tenant_id AND tm.user_id = NEW.user_id AND tm.status = 'active'
    ) THEN
        RAISE EXCEPTION 'person is not on this store''s team' USING ERRCODE = '23503';
    END IF;
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_shop_staff_guard ON public.shop_staff;
CREATE TRIGGER trg_shop_staff_guard
    BEFORE INSERT ON public.shop_staff
    FOR EACH ROW EXECUTE FUNCTION public.shop_staff_guard();

-- ---------------------------------------------------------------------------
-- till_settings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.till_settings (
    tenant_id                uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    -- NULL = a cashier may give any discount (Ali, decision 11).
    cashier_discount_pct     numeric(5,2) CHECK (cashier_discount_pct IS NULL OR cashier_discount_pct BETWEEN 0 AND 100),
    pay_later_default_limit  bigint NOT NULL DEFAULT 25000 CHECK (pay_later_default_limit >= 0),
    commission_pct           numeric(5,2) NOT NULL DEFAULT 0 CHECK (commission_pct BETWEEN 0 AND 100),
    return_days              integer NOT NULL DEFAULT 7 CHECK (return_days BETWEEN 0 AND 365),
    lock_after_minutes       integer NOT NULL DEFAULT 2 CHECK (lock_after_minutes BETWEEN 1 AND 120),
    pin_for_refunds          boolean NOT NULL DEFAULT true,
    whatsapp_receipt_default boolean NOT NULL DEFAULT true,
    updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.till_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS till_settings_select ON public.till_settings;
CREATE POLICY till_settings_select ON public.till_settings
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));

DROP POLICY IF EXISTS till_settings_insert ON public.till_settings;
CREATE POLICY till_settings_insert ON public.till_settings
    FOR INSERT TO authenticated
    WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids())
                AND public.has_tenant_permission(tenant_id, 'shops.manage'));

DROP POLICY IF EXISTS till_settings_update ON public.till_settings;
CREATE POLICY till_settings_update ON public.till_settings
    FOR UPDATE TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids())
           AND public.has_tenant_permission(tenant_id, 'shops.manage'))
    WITH CHECK (tenant_id IN (SELECT public.get_user_tenant_ids())
                AND public.has_tenant_permission(tenant_id, 'shops.manage'));

REVOKE ALL ON public.till_settings FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.till_settings TO authenticated;

CREATE OR REPLACE FUNCTION public.till_settings_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION 'settings cannot move to another store' USING ERRCODE = '42501';
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_till_settings_touch ON public.till_settings;
CREATE TRIGGER trg_till_settings_touch
    BEFORE INSERT OR UPDATE ON public.till_settings
    FOR EACH ROW EXECUTE FUNCTION public.till_settings_touch();

-- ---------------------------------------------------------------------------
-- till_pins (no browser access; functions only)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.till_pins (
    tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id          uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    pin_hash         text NOT NULL,
    failed_attempts  integer NOT NULL DEFAULT 0,
    locked_until     timestamptz,
    updated_at       timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, user_id)
);

ALTER TABLE public.till_pins ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: deny all to anon/authenticated.
REVOKE ALL ON public.till_pins FROM anon, authenticated;

-- The caller sets (or changes) their own PIN for a store they belong to.
CREATE OR REPLACE FUNCTION public.set_my_till_pin(p_tenant_id uuid, p_pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
BEGIN
    IF auth.uid() IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'not a member of this store' USING ERRCODE = '42501';
    END IF;
    IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
        RAISE EXCEPTION 'PIN must be 4 digits' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.till_pins (tenant_id, user_id, pin_hash)
    VALUES (p_tenant_id, auth.uid(), extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
    ON CONFLICT (tenant_id, user_id) DO UPDATE
        SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now();
END;
$function$;

-- An owner clears a member's PIN (forgotten PIN); the member then sets a new one.
CREATE OR REPLACE FUNCTION public.clear_till_pin(p_tenant_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.has_tenant_permission(p_tenant_id, 'shops.manage') THEN
        RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.till_pins WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
END;
$function$;

-- Checks a member's PIN on a shared till. The caller must be signed in to the
-- same store. Five wrong tries lock that PIN for 5 minutes.
-- Returns 'ok', 'wrong', 'locked' or 'no_pin'.
CREATE OR REPLACE FUNCTION public.check_till_pin(p_tenant_id uuid, p_user_id uuid, p_pin text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_row public.till_pins%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR p_tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
        RAISE EXCEPTION 'not a member of this store' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.tenant_members tm
         WHERE tm.tenant_id = p_tenant_id AND tm.user_id = p_user_id AND tm.status = 'active'
    ) THEN
        RETURN 'no_pin';
    END IF;

    SELECT * INTO v_row FROM public.till_pins
     WHERE tenant_id = p_tenant_id AND user_id = p_user_id
     FOR UPDATE;
    IF NOT FOUND THEN
        RETURN 'no_pin';
    END IF;
    IF v_row.locked_until IS NOT NULL AND v_row.locked_until > now() THEN
        RETURN 'locked';
    END IF;

    IF p_pin ~ '^[0-9]{4}$' AND v_row.pin_hash = extensions.crypt(p_pin, v_row.pin_hash) THEN
        UPDATE public.till_pins SET failed_attempts = 0, locked_until = NULL
         WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
        RETURN 'ok';
    END IF;

    UPDATE public.till_pins
       SET failed_attempts = v_row.failed_attempts + 1,
           locked_until = CASE WHEN v_row.failed_attempts + 1 >= 5 THEN now() + interval '5 minutes' END
     WHERE tenant_id = p_tenant_id AND user_id = p_user_id;
    RETURN CASE WHEN v_row.failed_attempts + 1 >= 5 THEN 'locked' ELSE 'wrong' END;
END;
$function$;

-- Which members of the store have a PIN (no hashes), for the owner's screen
-- and the cashier switcher.
CREATE OR REPLACE FUNCTION public.till_pin_status(p_tenant_id uuid)
RETURNS TABLE (user_id uuid, has_pin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT tm.user_id, (tp.user_id IS NOT NULL) AS has_pin
      FROM public.tenant_members tm
      LEFT JOIN public.till_pins tp ON tp.tenant_id = tm.tenant_id AND tp.user_id = tm.user_id
     WHERE tm.tenant_id = p_tenant_id
       AND tm.status = 'active'
       AND p_tenant_id IN (SELECT public.get_user_tenant_ids());
$function$;

REVOKE ALL ON FUNCTION public.set_my_till_pin(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.clear_till_pin(uuid, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.check_till_pin(uuid, uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION public.till_pin_status(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_my_till_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_till_pin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_till_pin(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.till_pin_status(uuid) TO authenticated;
