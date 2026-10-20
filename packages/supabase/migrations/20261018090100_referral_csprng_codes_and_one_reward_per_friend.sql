-- Referrals: unguessable codes, and one referrer reward per friend.
--
-- Builds on the live 20260909230753_referrals (PR #80). Two changes:
--
-- 1. mint_referral_code drew its six characters from random(), which is a
--    seeded PRNG, not a cryptographic source: outputs observed from one
--    backend predict the codes it mints next. A code is worth points, so it
--    must not be predictable. Characters now come from gen_random_uuid()
--    (core since PG13, backed by the OS CSPRNG), with rejection sampling so
--    every character of the 31-letter alphabet is equally likely
--    (248 = 8 × 31; bytes 248–255 are discarded). 31^6 ≈ 8.9 × 10^8 codes
--    per tenant; the storefront's validate endpoint rate-limits guessing.
--    Existing codes are unaffected (none exist live today).
--
-- 2. referral_check decides "first order" when the order is PLACED, so two
--    orders placed close together by the same new buyer both pass it and both
--    get an attribution row. The trigger then paid the referrer once per
--    delivered order — twice for one friend. It now pays only if no OTHER
--    referral for that friend (tenant + referee phone) currently holds a net
--    reward, under a transaction-scoped advisory lock on (tenant, referee) so
--    two deliveries committing at once cannot both see "none". Reversal is
--    unchanged: leaving delivered/completed takes back what this row paid,
--    capped at the balance; a re-delivery tops it back up to referrer_points.

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
    _bytes    bytea;
    _b        int;
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
        WHILE length(_code) < 6 LOOP
            _bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
            -- Skip the version/variant bytes (6 and 8), which are not random.
            FOR _j IN 0..15 LOOP
                CONTINUE WHEN _j IN (6, 8);
                _b := get_byte(_bytes, _j);
                CONTINUE WHEN _b >= 248;
                _code := _code || substr(_alphabet, 1 + (_b % 31), 1);
                EXIT WHEN length(_code) = 6;
            END LOOP;
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
        -- One reward per friend: serialise on (tenant, referee), then refuse
        -- if another of this friend's referred orders already holds one.
        PERFORM pg_advisory_xact_lock(hashtextextended(_r.tenant_id::text || ':' || _r.referee_phone, 0));
        IF EXISTS (
            SELECT 1 FROM public.referrals o
            WHERE o.tenant_id = _r.tenant_id
              AND o.referee_phone = _r.referee_phone
              AND o.id <> _r.id
              AND o.rewarded_points - o.reversed_points > 0
        ) THEN
            RETURN NEW;
        END IF;

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

-- CREATE OR REPLACE keeps existing grants; restate the lockdown regardless.
REVOKE EXECUTE ON FUNCTION public.mint_referral_code(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.referral_order_changed() FROM PUBLIC, anon, authenticated;

-- The "another reward for this friend" probe.
CREATE INDEX IF NOT EXISTS idx_referrals_tenant_referee
    ON public.referrals (tenant_id, referee_phone);

NOTIFY pgrst, 'reload schema';
