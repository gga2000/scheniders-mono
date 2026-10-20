-- =============================================================================
-- Order numbers from a counter no tenant can steer; no global order lock
-- Fixes F-040 (P0) and the database half of F-041 (P1) — audit-final/FINDINGS.md
-- =============================================================================
--
-- WHAT WAS WRONG (live create_order_atomic(jsonb,uuid), 2026-10-20)
--   * The next number was MAX(<digits after the prefix>)::int over EVERY
--     tenant's orders sharing the '<source digit><YYMMDD>' prefix. Any member
--     could INSERT an own-tenant row, or UPDATE an own order's order_id, to
--     '4<YYMMDD>99999999999': the ::int cast then raised 22003 and order
--     creation stopped for every tenant until the day ended (dates ahead
--     could be poisoned in advance). The caller could also hand the RPC its
--     own order_id.
--   * The prefix scan cannot use orders_order_id_key (not text_pattern_ops)
--     and read the whole table, under pg_advisory_xact_lock(hashtext(
--     'create_order_lock')): ONE lock for all order creation on the platform,
--     held through the insert and its triggers, and taken before the
--     idempotency replay check, so even replays queued behind it.
--
-- WHAT THIS DOES
--   1. Numbers come from four sequences (one per source digit) plus a tiny
--      day table holding each prefix's base. n = nextval - base, so the
--      visible format stays '<digit><YYMMDD><n, at least 3 digits>' and each
--      source/day still counts 001, 002, ... No table scan, no lock shared
--      between tenants, and nothing a tenant writes into orders feeds it. A
--      number someone already holds (a passthrough order_id) is skipped by
--      an equality probe on orders_order_id_key. Rolled-back orders leave
--      gaps, as any sequence does.
--   2. Today's (and any later-dated) prefixes are seeded from live orders, so
--      numbering continues where it is and never collides with existing rows.
--      The migration takes the old global lock first, so no old-style call
--      commits a number between the seed scan and the switch.
--   3. create_order_atomic(jsonb,uuid) — signature, SECURITY DEFINER, search
--      path, grants, payload handling and return shape unchanged — now:
--        - answers an idempotent replay BEFORE taking any lock;
--        - refuses a caller-supplied order_id unless the caller is the server
--          (service_role: LightFunnels passes its own numbers);
--        - takes a PER-TENANT advisory lock (only for the per-tenant
--          sequence_number MAX+1, which needs it) and re-checks the replay
--          under it;
--        - takes the number from public.next_order_number().
--      create_order_atomic(jsonb) only delegates; it is unchanged.
--   4. A trigger refuses, for anon/authenticated, INSERT into orders and any
--      UPDATE that changes order_id. Writing order_id back unchanged (full-row
--      saves) still works; SECURITY DEFINER functions and the service role
--      (server actions, webhooks, storefront) are unaffected. A column REVOKE
--      cannot do this: authenticated holds table-level INSERT/UPDATE.
--   No CHECK on the order_id format: live rows use dozens of shapes
--   (LightFunnels, returns RTN-/RPL-, clones, imports), so one would break
--   existing rows and legitimate passthrough numbers.
--
-- LIVE SEED (SELECT-only measurement, 2026-10-20 13:55 UTC): today's prefixes
--   4261020 max 1; 1261020 / 2261020 / 3261020 none. No later-dated prefix.
--   Historic max per prefix is 46 (4260319); 223 prefixes since 1251227.
--
-- ROLLOUT: apply this migration BEFORE (or with) the app deploy of the same
--   branch. The new app code sends no order_id from clients and moves the
--   order-number edit to a server action; old app code keeps working against
--   this migration except the in-place order-number edit and snapshot
--   restore of deleted orders, which the trigger refuses for a browser.
--
-- ROLLBACK
--   DROP TRIGGER trg_orders_order_id_server_only ON public.orders;
--   DROP FUNCTION public.orders_order_id_server_only();
--   Re-apply the create_order_atomic(jsonb,uuid) body from migration
--   20261017120000_create_order_atomic_reports_idempotent_replay.sql
--   (the live body this replaces), then
--   DROP FUNCTION public.next_order_number(text);
--   DROP TABLE public.order_number_days;
--   DROP SEQUENCE public.order_number_seq_1, public.order_number_seq_2,
--                 public.order_number_seq_3, public.order_number_seq_4;
-- =============================================================================

-- Wait for in-flight old-style calls and hold new ones until this commits.
SELECT pg_advisory_xact_lock(hashtext('create_order_lock')::bigint);

-- ---------------------------------------------------------------------------
-- 1. Counter objects (server-only)
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq_1 AS bigint;
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq_2 AS bigint;
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq_3 AS bigint;
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq_4 AS bigint;

CREATE TABLE IF NOT EXISTS public.order_number_days (
    prefix     text PRIMARY KEY CHECK (prefix ~ '^[1-4][0-9]{6}$'),
    base       bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.order_number_days IS
    'Per <source digit><YYMMDD> prefix: the order_number_seq_<digit> value before that day''s first number (n = nextval - base). Platform-wide counter, not tenant data; server-only, written by next_order_number().';

-- Not tenant data and never read by a client: RLS on with no policies, and no
-- grants (Supabase's default privileges grant new objects to anon/authenticated).
ALTER TABLE public.order_number_days ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.order_number_days FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.order_number_seq_1, public.order_number_seq_2,
                       public.order_number_seq_3, public.order_number_seq_4
    FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Seed from live orders: next number = live max + 1 for today's and any
--    later-dated prefix. Only pure-digit numbers can collide with generated
--    ones; the length bound keeps a planted giant out of bigint arithmetic
--    (the skip probe in next_order_number covers anything left out).
-- ---------------------------------------------------------------------------
DO $seed$
DECLARE
    _d int;
    _v bigint;
    _r record;
BEGIN
    FOR _d IN 1..4 LOOP
        -- The value the sequence stands at (no nextval, so a re-run of this
        -- migration draws nothing): its next nextval is _v + 1.
        EXECUTE format('SELECT CASE WHEN is_called THEN last_value ELSE last_value - 1 END FROM public.order_number_seq_%s', _d)
           INTO _v;
        FOR _r IN
            SELECT left(order_id, 7) AS prefix, max(substring(order_id FROM 8)::bigint) AS m
              FROM public.orders
             WHERE order_id ~ ('^' || _d || '[0-9]{6}[0-9]{1,15}$')
               AND substring(order_id FROM 2 FOR 6) BETWEEN to_char(current_date, 'YYMMDD')
                                                       AND to_char(current_date + 366, 'YYMMDD')
             GROUP BY 1
        LOOP
            INSERT INTO public.order_number_days (prefix, base)
            VALUES (_r.prefix, _v - _r.m)
            ON CONFLICT (prefix) DO UPDATE
               SET base = LEAST(public.order_number_days.base, EXCLUDED.base);
        END LOOP;
    END LOOP;
END;
$seed$;

-- ---------------------------------------------------------------------------
-- 3. next_order_number(source digit) -> '<digit><YYMMDD><nnn>'
-- ---------------------------------------------------------------------------
-- Runs as its caller; only create_order_atomic (SECURITY DEFINER, owner
-- postgres) calls it. No lock is held across tenants: nextval never blocks,
-- and the day row is inserted once per prefix per day (a concurrent first
-- caller of the same day waits only for that one insert's transaction).
CREATE OR REPLACE FUNCTION public.next_order_number(_source_code text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    _prefix text;
    _seq regclass;
    _v bigint;
    _base bigint;
    _candidate text;
BEGIN
    IF _source_code IS NULL OR _source_code !~ '^[1-4]$' THEN
        RAISE EXCEPTION 'next_order_number: invalid source code %', _source_code USING ERRCODE = '22023';
    END IF;
    _prefix := _source_code || to_char(current_date, 'YYMMDD');
    _seq := format('public.order_number_seq_%s', _source_code)::regclass;

    LOOP
        _v := nextval(_seq);
        SELECT base INTO _base FROM public.order_number_days WHERE prefix = _prefix;
        IF NOT FOUND THEN
            INSERT INTO public.order_number_days (prefix, base) VALUES (_prefix, _v - 1)
            ON CONFLICT (prefix) DO NOTHING;
            SELECT base INTO STRICT _base FROM public.order_number_days WHERE prefix = _prefix;
        END IF;
        -- A concurrent first caller of the day set a base above this value:
        -- draw again (the next value is above every value already drawn).
        CONTINUE WHEN _v - _base < 1;
        _candidate := _prefix || lpad((_v - _base)::text, 3, '0');
        -- Skip a number already held (a passthrough order_id, or a row the
        -- seed did not count). Equality probe on orders_order_id_key.
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_id = _candidate);
    END LOOP;

    RETURN _candidate;
END;
$function$;

REVOKE ALL ON FUNCTION public.next_order_number(text) FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. create_order_atomic(jsonb, uuid) — live body with the changes above
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb, _tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _source_code text; _next_sequence_number int4; _generated_order_id text; _result jsonb;
  _items_safe jsonb; _attention_safe jsonb; _idem text; _is_server boolean;
BEGIN
  _is_server := coalesce(auth.role(), 'service_role') = 'service_role';
  IF NOT _is_server THEN
    IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
      RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Replay first, before any lock: a lost-response retry never queues.
  _idem := NULLIF(_order_data->>'idempotency_key', '');
  IF _idem IS NOT NULL THEN
    SELECT to_jsonb(orders.*) INTO _result FROM public.orders
     WHERE idempotency_key = _idem AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
     LIMIT 1;
    IF _result IS NOT NULL THEN
      RETURN _result || jsonb_build_object('idempotent_replay', true);
    END IF;
  END IF;

  -- F-040: order numbers are the server's. Only the service role may pass one
  -- through (LightFunnels order names, server-built return/clone numbers).
  _generated_order_id := NULLIF(_order_data->>'order_id', '');
  IF _generated_order_id IS NOT NULL AND NOT _is_server THEN
    RAISE EXCEPTION 'order_id is assigned by the server' USING ERRCODE = '42501';
  END IF;

  -- F-041: per-tenant, not global. It serialises only this tenant's calls,
  -- for the per-tenant sequence_number below and the replay re-check.
  PERFORM pg_advisory_xact_lock(hashtextextended('create_order_atomic:' || coalesce(_tenant_id::text, ''), 0));

  IF _idem IS NOT NULL THEN
    SELECT to_jsonb(orders.*) INTO _result FROM public.orders
     WHERE idempotency_key = _idem AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
     LIMIT 1;
    IF _result IS NOT NULL THEN
      RETURN _result || jsonb_build_object('idempotent_replay', true);
    END IF;
  END IF;

  IF _generated_order_id IS NULL THEN
    _source_code := CASE
      WHEN (_order_data->>'source') = 'whatsapp' THEN '1'
      WHEN (_order_data->>'source') = 'meta'     THEN '2'
      WHEN (_order_data->>'source') = 'tiktok'   THEN '3'
      ELSE '4'
    END;
    _generated_order_id := public.next_order_number(_source_code);
  END IF;
  _order_data := jsonb_set(_order_data, '{order_id}', to_jsonb(_generated_order_id));

  SELECT COALESCE(MAX(sequence_number), 0) + 1 INTO _next_sequence_number
    FROM public.orders WHERE (_tenant_id IS NULL OR tenant_id = _tenant_id);
  _order_data := jsonb_set(_order_data, '{sequence_number}', to_jsonb(_next_sequence_number));
  _order_data := _order_data - 'id' - 'created_at' - 'updated_at';
  _items_safe := CASE WHEN jsonb_typeof(_order_data->'items') = 'array' THEN _order_data->'items' ELSE '[]'::jsonb END;
  _attention_safe := CASE WHEN jsonb_typeof(_order_data->'attention_reasons') = 'array' THEN _order_data->'attention_reasons' ELSE '[]'::jsonb END;

  INSERT INTO public.orders (
    order_id, sequence_number, customer_name, phone, secondary_phone, city, address_details,
    items, price, delivery_fee, discount_amount, priority, status, payment_status, is_return,
    is_shop_order, source, governorate_code, validated_governorate_code, notes, risk_metadata,
    needs_attention, attention_reasons, last_status_changed_by_name, last_status_changed_by_avatar,
    attribution, ad_channel,
    idempotency_key, tenant_id
  )
  SELECT
    _order_data->>'order_id', (_order_data->>'sequence_number')::int4,
    _order_data->>'customer_name', _order_data->>'phone', _order_data->>'secondary_phone',
    _order_data->>'city', _order_data->>'address_details', _items_safe,
    (_order_data->>'price')::numeric, COALESCE((_order_data->>'delivery_fee'), '0')::numeric,
    COALESCE(_order_data->>'discount_amount', '0')::numeric, COALESCE(_order_data->>'priority', 'normal'),
    COALESCE(_order_data->>'status', 'confirmed'), COALESCE(_order_data->>'payment_status', 'cod'),
    COALESCE((_order_data->>'is_return')::boolean, false), COALESCE((_order_data->>'is_shop_order')::boolean, false),
    COALESCE(_order_data->>'source', 'manual'), _order_data->>'governorate_code',
    _order_data->>'validated_governorate_code', _order_data->>'notes', _order_data->'risk_metadata',
    COALESCE((_order_data->>'needs_attention')::boolean, false),
    ARRAY(SELECT jsonb_array_elements_text(_attention_safe)),
    _order_data->>'last_status_changed_by_name', _order_data->>'last_status_changed_by_avatar',
    -- Guard the shape: a malformed payload must not abort an order creation.
    CASE WHEN jsonb_typeof(_order_data->'attribution') = 'object' THEN _order_data->'attribution' ELSE NULL END,
    NULLIF(_order_data->>'ad_channel', ''),
    _idem, _tenant_id
  RETURNING to_jsonb(orders.*) INTO _result;
  RETURN _result;
END;
$function$;

-- CREATE OR REPLACE keeps the live ACL (postgres, authenticated, service_role);
-- restated so a fresh database matches.
REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Browsers cannot write orders.order_id
-- ---------------------------------------------------------------------------
-- Not SECURITY DEFINER on purpose: current_user is the writer. Inside a
-- SECURITY DEFINER function (create_order_atomic, split/merge RPCs) it is the
-- function owner, and for server code it is service_role.
CREATE OR REPLACE FUNCTION public.orders_order_id_server_only()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'orders are created through the server (create_order_atomic); order_id is assigned by the server'
        USING ERRCODE = '42501';
    ELSIF NEW.order_id IS DISTINCT FROM OLD.order_id THEN
      RAISE EXCEPTION 'order_id can only be changed through the server'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.orders_order_id_server_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_orders_order_id_server_only ON public.orders;
CREATE TRIGGER trg_orders_order_id_server_only
    BEFORE INSERT OR UPDATE OF order_id ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.orders_order_id_server_only();
