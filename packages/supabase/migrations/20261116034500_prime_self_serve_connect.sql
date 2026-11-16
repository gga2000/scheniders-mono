-- Fermi A3: a store connects its own Prime account.
--
-- The store's admin types the phone of their Prime account. The platform asks
-- Prime which merchants are linked to our integrated system and finds theirs.
-- One shop that no other store uses connects at once; anything else waits on
-- the request with the reason (outcome), and our team approves it in one click
-- once the Prime details are known. Until Prime links the account to our
-- system, the prime-sync cron looks again every few minutes.
--
-- 1. prime_link_requests keeps what the check found: outcome, checked_at, the
--    Prime login, name, shop and (to choose from) shops. The store reads only
--    the outcome columns; the Prime details of an account another store uses
--    stay with the server. Requests are created by the server only, after the
--    check (the old browser insert is withdrawn).
-- 2. prime_connections.merchant_key is the Prime login in one comparable form
--    (a phone login as 07XXXXXXXXX, anything else lower-case), and
--    merchant_key_hash its sha256, so B5 (one free trial per merchant) can
--    compare stores. A trigger keeps both in step with merchant_login_id.
-- 3. prime_account_taken(store, login): another store uses the account or has
--    asked for it.
-- 4. link_prime_request(request, shop, approved_by) is the one way a request
--    becomes a live link: in one transaction it writes the connection, stamps
--    the request and tells the store. Without approved_by (the store itself)
--    it refuses a Prime account another store uses or asks for, and marks the
--    request for our team instead; an advisory lock on the account makes two
--    stores racing for it take turns.
--
-- Rollback:
--   DROP FUNCTION public.link_prime_request(uuid, integer, uuid), public.prime_account_taken(uuid, text);
--   DROP TRIGGER prime_connections_key ON public.prime_connections;
--   DROP FUNCTION public.prime_connections_key(), public.prime_merchant_key(text);
--   DROP INDEX public.prime_connections_merchant_key_hash_idx;
--   ALTER TABLE public.prime_connections DROP COLUMN merchant_key, DROP COLUMN merchant_key_hash;
--   ALTER TABLE public.prime_link_requests DROP COLUMN outcome, DROP COLUMN checked_at,
--     DROP COLUMN prime_login_id, DROP COLUMN prime_name, DROP COLUMN prime_shop_id, DROP COLUMN prime_shops;
--   GRANT SELECT ON public.prime_link_requests TO authenticated;
--   GRANT INSERT (tenant_id, prime_phone) ON public.prime_link_requests TO authenticated;
--   and the prime_link_requests_insert policy from 20261108222200_prime_link_requests.sql

-- 1. What the check found.
ALTER TABLE public.prime_link_requests
    ADD COLUMN outcome text
        CONSTRAINT prime_link_requests_outcome_check
        CHECK (outcome IN ('not_linked', 'shared_account', 'choose_shop', 'no_shop', 'prime_down')),
    ADD COLUMN checked_at timestamptz,
    ADD COLUMN prime_login_id text
        CONSTRAINT prime_link_requests_prime_login_check
        CHECK (prime_login_id IS NULL OR length(btrim(prime_login_id)) > 0),
    ADD COLUMN prime_name text,
    ADD COLUMN prime_shop_id integer
        CONSTRAINT prime_link_requests_prime_shop_check
        CHECK (prime_shop_id IS NULL OR prime_shop_id > 0),
    ADD COLUMN prime_shops jsonb
        CONSTRAINT prime_link_requests_prime_shops_check
        CHECK (prime_shops IS NULL OR jsonb_typeof(prime_shops) = 'array');

COMMENT ON COLUMN public.prime_link_requests.outcome IS
    'Why the request is still open: not_linked (Prime has not linked the account to our system yet), shared_account (another store uses or asked for it: our team approves), choose_shop (the store picks one of prime_shops), no_shop (no active shop at Prime), prime_down (Prime did not answer). NULL = not checked yet.';

DROP POLICY IF EXISTS prime_link_requests_insert ON public.prime_link_requests;
REVOKE INSERT ON public.prime_link_requests FROM authenticated;
REVOKE SELECT ON public.prime_link_requests FROM authenticated;
GRANT SELECT (id, tenant_id, prime_phone, created_at, linked_at, outcome, checked_at)
    ON public.prime_link_requests TO authenticated;

-- 2. One comparable form of a Prime login.
CREATE OR REPLACE FUNCTION public.prime_merchant_key(_login text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
        WHEN regexp_replace(lower(btrim(_login)), '[[:space:]-]', '', 'g') ~ '^(\+?964|00964|0)?7[0-9]{9}$'
            THEN '0' || right(regexp_replace(lower(btrim(_login)), '[[:space:]-]', '', 'g'), 10)
        ELSE lower(btrim(_login))
    END
$function$;
REVOKE ALL ON FUNCTION public.prime_merchant_key(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prime_merchant_key(text) TO service_role;

ALTER TABLE public.prime_connections
    ADD COLUMN merchant_key text,
    ADD COLUMN merchant_key_hash text;

CREATE OR REPLACE FUNCTION public.prime_connections_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    NEW.merchant_key := public.prime_merchant_key(NEW.merchant_login_id);
    NEW.merchant_key_hash := encode(sha256(convert_to(NEW.merchant_key, 'UTF8')), 'hex');
    RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.prime_connections_key() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER prime_connections_key
    BEFORE INSERT OR UPDATE OF merchant_login_id ON public.prime_connections
    FOR EACH ROW EXECUTE FUNCTION public.prime_connections_key();

UPDATE public.prime_connections SET merchant_login_id = merchant_login_id;

ALTER TABLE public.prime_connections
    ALTER COLUMN merchant_key SET NOT NULL,
    ALTER COLUMN merchant_key_hash SET NOT NULL;

CREATE INDEX prime_connections_merchant_key_hash_idx ON public.prime_connections (merchant_key_hash);

-- 3. Whether another store uses this Prime account or has asked for it. The
--    server asks before it shows a store the account's shops.
CREATE OR REPLACE FUNCTION public.prime_account_taken(_tenant_id uuid, _login text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.prime_connections c
        WHERE c.merchant_key = public.prime_merchant_key(_login) AND c.tenant_id <> _tenant_id
    ) OR EXISTS (
        SELECT 1 FROM public.prime_link_requests r
        WHERE r.tenant_id <> _tenant_id
          AND r.linked_at IS NULL
          AND r.prime_login_id IS NOT NULL
          AND public.prime_merchant_key(r.prime_login_id) = public.prime_merchant_key(_login)
    )
$function$;
REVOKE ALL ON FUNCTION public.prime_account_taken(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prime_account_taken(uuid, text) TO service_role;

-- 4. A request becomes a live link.
CREATE OR REPLACE FUNCTION public.link_prime_request(
    _request_id uuid,
    _shop_id integer DEFAULT NULL,
    _approved_by uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _req public.prime_link_requests%ROWTYPE;
    _key text;
    _shop integer;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'link_prime_request is service-role only' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO _req FROM public.prime_link_requests WHERE id = _request_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    IF _req.linked_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_linked');
    END IF;
    IF _req.prime_login_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_resolved');
    END IF;

    _shop := coalesce(_shop_id, _req.prime_shop_id);
    IF _shop IS NULL OR _shop <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'no_shop');
    END IF;
    -- A shop the store picks must be one Prime listed for this account.
    IF _shop_id IS NOT NULL AND _shop_id IS DISTINCT FROM _req.prime_shop_id AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(_req.prime_shops, '[]'::jsonb)) AS s(shop)
        WHERE s.shop ->> 'id' = _shop_id::text
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'unknown_shop');
    END IF;

    _key := public.prime_merchant_key(_req.prime_login_id);
    PERFORM pg_advisory_xact_lock(hashtextextended('prime_link:' || _key, 0));

    -- The store itself cannot take a Prime account another store uses or has
    -- asked for: that is our team's call.
    IF _approved_by IS NULL AND public.prime_account_taken(_req.tenant_id, _req.prime_login_id) THEN
        UPDATE public.prime_link_requests
        SET outcome = 'shared_account', checked_at = now()
        WHERE id = _req.id;
        RETURN jsonb_build_object('success', false, 'error', 'shared_account');
    END IF;

    INSERT INTO public.prime_connections (tenant_id, merchant_login_id, shop_id, is_active)
    VALUES (_req.tenant_id, _req.prime_login_id, _shop, true)
    ON CONFLICT (tenant_id) DO UPDATE SET
        merchant_login_id = EXCLUDED.merchant_login_id,
        shop_id = EXCLUDED.shop_id,
        is_active = true,
        last_error = NULL,
        -- Another Prime account starts its own payment history.
        last_payment_id = CASE
            WHEN public.prime_connections.merchant_key = _key
                THEN public.prime_connections.last_payment_id
        END,
        updated_at = now();

    UPDATE public.prime_link_requests
    SET linked_at = now(), linked_by = _approved_by, prime_shop_id = _shop, outcome = NULL, checked_at = now()
    WHERE id = _req.id;

    INSERT INTO public.notifications (tenant_id, type, category, audience, recipient_id, payload, priority, group_key)
    VALUES (_req.tenant_id, 'prime.link_done', 'delivery', 'tenant', NULL, '{}'::jsonb, 'high', 'prime.link_done:' || _req.id);

    RETURN jsonb_build_object('success', true, 'tenant_id', _req.tenant_id, 'shop_id', _shop);
END
$function$;
REVOKE ALL ON FUNCTION public.link_prime_request(uuid, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_prime_request(uuid, integer, uuid) TO service_role;
