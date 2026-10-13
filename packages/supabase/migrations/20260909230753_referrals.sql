-- Recorded from live schema_migrations; applied 2026-09-09 from branch
-- feat/flagship-template (PR #80, source commit 2973372c, drafted there as
-- 20260910130000_referrals.sql); do not edit.
-- Body below is the exact statement that ran under version 20260909230753.
-- It creates idx_orders_tenant_phone_key; authenticated order writes need
-- EXECUTE on loyalty_phone_key, granted by main's later
-- 20260910000500_grant_execute_loyalty_phone_key (same order as live).

-- Mirror of packages/supabase/migrations/20260910130000_referrals.sql

CREATE TABLE IF NOT EXISTS public.referral_codes (
    tenant_id  uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    phone      text NOT NULL,
    code       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, phone),
    UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.referrals (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    order_id        uuid NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
    code            text NOT NULL,
    referrer_phone  text NOT NULL,
    referee_phone   text NOT NULL,
    discount_iqd    integer NOT NULL DEFAULT 0,
    rewarded_points integer NOT NULL DEFAULT 0,
    reversed_points integer NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_referrals_tenant_referrer
    ON public.referrals (tenant_id, referrer_phone);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_codes_member_select ON public.referral_codes;
CREATE POLICY referral_codes_member_select ON public.referral_codes
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
DROP POLICY IF EXISTS referrals_member_select ON public.referrals;
CREATE POLICY referrals_member_select ON public.referrals
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
REVOKE ALL ON public.referral_codes FROM anon;
REVOKE ALL ON public.referrals FROM anon;

CREATE INDEX IF NOT EXISTS idx_orders_tenant_phone_key
    ON public.orders (tenant_id, public.loyalty_phone_key(phone))
    WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.mint_referral_code(_tenant_id uuid, _phone text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    _key      text := public.loyalty_phone_key(_phone);
    _alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    _code     text;
    _i        int;
    _j        int;
BEGIN
    IF _key IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT code INTO _code FROM public.referral_codes WHERE tenant_id = _tenant_id AND phone = _key;
    IF _code IS NOT NULL THEN
        RETURN _code;
    END IF;
    FOR _i IN 1..20 LOOP
        _code := '';
        FOR _j IN 1..6 LOOP
            _code := _code || substr(_alphabet, 1 + floor(random() * length(_alphabet))::int, 1);
        END LOOP;
        BEGIN
            INSERT INTO public.referral_codes (tenant_id, phone, code) VALUES (_tenant_id, _key, _code);
            RETURN _code;
        EXCEPTION WHEN unique_violation THEN
            SELECT code INTO _code FROM public.referral_codes WHERE tenant_id = _tenant_id AND phone = _key;
            IF _code IS NOT NULL THEN
                RETURN _code;
            END IF;
        END;
    END LOOP;
    RAISE EXCEPTION 'referral_code_exhausted';
END;
$$;

CREATE OR REPLACE FUNCTION public.referral_check(_tenant_id uuid, _code text, _phone text)
RETURNS TABLE (ok boolean, reason text, referrer_phone text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    _referrer text;
    _buyer    text := public.loyalty_phone_key(_phone);
BEGIN
    SELECT rc.phone INTO _referrer
    FROM public.referral_codes rc
    WHERE rc.tenant_id = _tenant_id AND rc.code = upper(regexp_replace(coalesce(_code, ''), '\s', '', 'g'));
    IF _referrer IS NULL THEN
        RETURN QUERY SELECT false, 'unknown'::text, NULL::text; RETURN;
    END IF;
    IF _buyer IS NOT NULL AND _buyer = _referrer THEN
        RETURN QUERY SELECT false, 'self'::text, _referrer; RETURN;
    END IF;
    IF _buyer IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.tenant_id = _tenant_id
          AND o.deleted_at IS NULL
          AND public.loyalty_phone_key(o.phone) = _buyer
          AND o.status NOT IN ('cancelled', 'rejected')
    ) THEN
        RETURN QUERY SELECT false, 'not_first_order'::text, _referrer; RETURN;
    END IF;
    RETURN QUERY SELECT true, 'ok'::text, _referrer;
END;
$$;

CREATE OR REPLACE FUNCTION public.referral_order_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    _earning_now    boolean := NEW.status IN ('delivered','completed') AND NEW.deleted_at IS NULL;
    _earning_before boolean := OLD.status IN ('delivered','completed') AND OLD.deleted_at IS NULL;
    _r       public.referrals%ROWTYPE;
    _cfg     jsonb;
    _points  integer;
    _net     integer;
    _balance integer;
BEGIN
    IF _earning_now = _earning_before THEN
        RETURN NEW;
    END IF;
    SELECT * INTO _r FROM public.referrals WHERE order_id = NEW.id;
    IF NOT FOUND THEN
        RETURN NEW;
    END IF;
    _net := _r.rewarded_points - _r.reversed_points;

    IF _earning_now THEN
        SELECT t.store_config_v2->'commerce' INTO _cfg FROM public.tenants t WHERE t.id = _r.tenant_id;
        IF jsonb_typeof(_cfg->'referral'->'enabled') = 'boolean' AND (_cfg->'referral'->'enabled')::boolean
           AND jsonb_typeof(_cfg->'loyalty'->'enabled') = 'boolean' AND (_cfg->'loyalty'->'enabled')::boolean
           AND jsonb_typeof(_cfg->'referral'->'referrer_points') = 'number' THEN
            _points := floor((_cfg->'referral'->>'referrer_points')::numeric)::int - greatest(_net, 0);
        ELSE
            _points := 0;
        END IF;
        IF _points > 0 THEN
            PERFORM public.adjust_customer_points(_r.tenant_id, _r.referrer_phone, _points, 'referral', NEW.id);
            UPDATE public.referrals SET rewarded_points = rewarded_points + _points WHERE id = _r.id;
        END IF;
    ELSIF _net > 0 THEN
        SELECT balance INTO _balance FROM public.customer_points
        WHERE tenant_id = _r.tenant_id AND phone = _r.referrer_phone;
        _points := least(_net, coalesce(_balance, 0));
        IF _points > 0 THEN
            PERFORM public.adjust_customer_points(_r.tenant_id, _r.referrer_phone, -_points, 'referral_reversal', NEW.id);
            UPDATE public.referrals SET reversed_points = reversed_points + _points WHERE id = _r.id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_referral_order_changed ON public.orders;
CREATE TRIGGER trg_referral_order_changed
    AFTER UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.referral_order_changed();

REVOKE EXECUTE ON FUNCTION public.mint_referral_code(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.referral_check(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.referral_order_changed() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
