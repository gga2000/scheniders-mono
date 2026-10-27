-- =============================================================================
-- LOCAL-ONLY fixture for order_number_counter.sql (F-040 / F-041)
-- =============================================================================
-- Recreates, on an EMPTY throwaway Postgres 16 database, the minimal live
-- objects that create_order_atomic touches, copied from the live project
-- (pg_get_functiondef / pg_policies / information_schema, 2026-10-20):
--   * roles anon / authenticated / service_role and Supabase's default
--     privileges (new tables, sequences and functions in public are granted
--     to anon and authenticated, which the migration must revoke);
--   * auth.uid() / auth.role() / auth.jwt() reading request.jwt.claims;
--   * tenants, user_profiles, tenant_members, get_user_tenant_ids();
--   * public.orders with the columns create_order_atomic writes, the global
--     orders_order_id_key, uq_orders_tenant_idempotency, the four live
--     tenant_isolation_* policies and authenticated's table-level grants;
--   * BOTH live overloads of create_order_atomic, verbatim;
--   * order_split_log and both live split_order_atomic overloads, verbatim;
--   * create_storefront_order with normalize_phone / loyalty_phone_key, verbatim.
-- Then it seeds today's orders so the migration's counter seed can be checked.
--
-- NEVER run this against a real project: it creates roles, schemas and tables.
--
--   createdb f040 && psql -d f040 -v ON_ERROR_STOP=1 -f packages/supabase/tests/fixtures/order_number_counter_fixture.sql
-- =============================================================================

DO $roles$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS dblink;

CREATE SCHEMA auth;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
-- Live definition.
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $function$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$function$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

CREATE TABLE public.tenants (id uuid PRIMARY KEY, name text);
CREATE TABLE public.user_profiles (id uuid PRIMARY KEY, is_active boolean DEFAULT true);
CREATE TABLE public.tenant_members (
    tenant_id uuid REFERENCES public.tenants(id),
    user_id uuid REFERENCES public.user_profiles(id),
    -- Live since 20261020215422_tenant_role_source_of_truth.
    role text NOT NULL DEFAULT 'employee'
        CONSTRAINT tenant_members_role_check CHECK (role IN ('admin', 'employee', 'viewer')),
    status text NOT NULL DEFAULT 'active',
    PRIMARY KEY (tenant_id, user_id)
);

-- Live definition.
CREATE OR REPLACE FUNCTION public.get_user_tenant_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT tm.tenant_id
  FROM tenant_members tm
  JOIN user_profiles up ON up.id = tm.user_id
  WHERE tm.user_id = auth.uid()
    AND tm.status = 'active'
    AND coalesce(up.is_active, true);
$function$;

-- The columns create_order_atomic reads or writes, with their live types,
-- defaults and NOT NULLs.
CREATE TABLE public.orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now(),
    order_id text NOT NULL,
    customer_name text NOT NULL,
    phone text NOT NULL,
    city text,
    governorate_code text,
    address_details text,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    price numeric NOT NULL,
    status text DEFAULT 'new'::text NOT NULL,
    notes text,
    priority text DEFAULT 'normal'::text,
    payment_status text DEFAULT 'cod'::text,
    delivery_fee numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    is_return boolean DEFAULT false,
    secondary_phone text,
    source text,
    sequence_number integer,
    validated_governorate_code text,
    is_shop_order boolean DEFAULT false,
    risk_metadata jsonb DEFAULT '{}'::jsonb,
    needs_attention boolean DEFAULT false,
    attention_reasons text[] DEFAULT '{}'::text[],
    last_status_changed_by_name text DEFAULT 'System'::text,
    last_status_changed_by_avatar text,
    version integer DEFAULT 1 NOT NULL,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
    idempotency_key text,
    attribution jsonb,
    ad_channel text,
    delivered_at timestamptz,
    original_order_id uuid,
    rejection_reason text,
    -- Margin columns (masked for non-admins since 20261021090000).
    product_cost numeric,
    net_profit numeric,
    waseet_merchant_price numeric,
    waseet_company_price numeric
);
CREATE UNIQUE INDEX orders_order_id_key ON public.orders USING btree (order_id);
CREATE UNIQUE INDEX uq_orders_tenant_idempotency ON public.orders USING btree (tenant_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON public.orders FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_insert ON public.orders FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_update ON public.orders FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids())) WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_delete ON public.orders FOR DELETE USING (tenant_id IN (SELECT get_user_tenant_ids()));

-- Live grants: authenticated holds table-level INSERT/SELECT/UPDATE/DELETE
-- (so a column-level REVOKE on order_id alone would be a no-op).
REVOKE ALL ON public.orders FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

-- Live definitions (pg_get_functiondef 2026-10-21): is_tenant_admin, and
-- mask_order_margin from 20261021090000_orders_margin_column_privileges.
CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE tenant_id = p_tenant_id
          AND user_id = auth.uid()
          AND role = 'admin'
          AND status = 'active'
    );
$function$;

CREATE OR REPLACE FUNCTION public.mask_order_margin(p_order jsonb, p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT CASE
        WHEN p_order IS NULL THEN NULL
        WHEN coalesce(auth.role(), 'service_role') = 'service_role' THEN p_order
        WHEN public.is_tenant_admin(p_tenant_id) THEN p_order
        ELSE p_order - ARRAY['product_cost', 'net_profit', 'waseet_merchant_price', 'waseet_company_price']
    END;
$function$;

-- ---------------------------------------------------------------------------
-- Live create_order_atomic overloads (pg_get_functiondef 2026-10-20; the
-- 2-arg body with main's 20261021090000 margin mask, as live on 2026-10-21)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb, _tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _source_code text; _date_str text; _prefix text; _count int4;
  _next_sequence_number int4; _generated_order_id text; _result jsonb;
  _advisory_lock_id bigint; _items_safe jsonb; _attention_safe jsonb; _idem text;
BEGIN
  IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
    IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
      RAISE EXCEPTION 'Unauthorized: tenant membership required' USING ERRCODE = '42501';
    END IF;
  END IF;

  _source_code := CASE
    WHEN (_order_data->>'source') = 'whatsapp' THEN '1'
    WHEN (_order_data->>'source') = 'meta'     THEN '2'
    WHEN (_order_data->>'source') = 'tiktok'   THEN '3'
    ELSE '4'
  END;
  _date_str := to_char(current_date, 'YYMMDD');
  _prefix := _source_code || _date_str;
  _advisory_lock_id := hashtext('create_order_lock')::bigint;
  PERFORM pg_advisory_xact_lock(_advisory_lock_id);

  _idem := NULLIF(_order_data->>'idempotency_key', '');
  IF _idem IS NOT NULL THEN
    SELECT public.mask_order_margin(to_jsonb(orders.*), orders.tenant_id) INTO _result FROM public.orders
     WHERE idempotency_key = _idem AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
     LIMIT 1;
    IF _result IS NOT NULL THEN
      RETURN _result || jsonb_build_object('idempotent_replay', true);
    END IF;
  END IF;

  _generated_order_id := _order_data->>'order_id';
  IF _generated_order_id IS NULL OR _generated_order_id = '' THEN
    -- INT-7: count across ALL tenants — orders_order_id_key is global.
    -- By PREFIX ONLY: filtering on created_at hid rows whose timestamp had
    -- been imported or edited, and produced duplicate order numbers.
    SELECT COALESCE(MAX(NULLIF(regexp_replace(SUBSTRING(order_id FROM length(_prefix) + 1), '\D', '', 'g'), '')::int), 0)
      INTO _count
      FROM public.orders
     WHERE order_id LIKE (_prefix || '%');
    _generated_order_id := _prefix || lpad((_count + 1)::text, 3, '0');
    _order_data := jsonb_set(_order_data, '{order_id}', to_jsonb(_generated_order_id));
  END IF;

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
  RETURNING public.mask_order_margin(to_jsonb(orders.*), orders.tenant_id) INTO _result;
  RETURN _result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_order_atomic(_order_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'create_order_atomic(jsonb) is deprecated - call create_order_atomic(jsonb, uuid) with an explicit tenant_id' USING ERRCODE = '42501';
    END IF;
    RETURN public.create_order_atomic(_order_data, NULL::uuid);
END;
$function$;

-- Live ACL: postgres, authenticated, service_role.
REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- split_order_atomic: the one database caller of create_order_atomic(jsonb,
-- uuid). Live order_split_log columns and both live overloads, verbatim.
-- ---------------------------------------------------------------------------
CREATE TABLE public.order_split_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    tenant_id uuid NOT NULL,
    original_order_id uuid NOT NULL,
    return_order_id uuid NOT NULL,
    original_before jsonb NOT NULL,
    split_at timestamptz DEFAULT now() NOT NULL,
    undone_at timestamptz
);
ALTER TABLE public.order_split_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.split_order_atomic(_original_order_id uuid, _kept_items jsonb, _returned_items jsonb, _tenant_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    _original_order record;
    _kept_total numeric := 0;
    _returned_total numeric := 0;
    _total_original numeric;
    _kept_ratio numeric;
    _new_discount numeric;
    _return_discount numeric;
    _new_price numeric;
    _return_price numeric;
    _return_order_data jsonb;
    _item jsonb;
    _created_return_order jsonb;
    _split_log_id uuid;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL THEN
            RAISE EXCEPTION 'tenant_id required' USING ERRCODE = '22023';
        END IF;
        IF _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: not a member of tenant %', _tenant_id USING ERRCODE = '42501';
        END IF;
    END IF;

    SELECT * INTO _original_order
    FROM public.orders
    WHERE id = _original_order_id
      AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Original order not found';
    END IF;

    FOR _item IN SELECT * FROM jsonb_array_elements(_kept_items)
    LOOP
        _kept_total := _kept_total + ((_item->>'price')::numeric * (_item->>'quantity')::numeric);
    END LOOP;
    FOR _item IN SELECT * FROM jsonb_array_elements(_returned_items)
    LOOP
        _returned_total := _returned_total + ((_item->>'price')::numeric * (_item->>'quantity')::numeric);
    END LOOP;

    _total_original := _kept_total + _returned_total;
    IF _total_original > 0 THEN
        _kept_ratio := _kept_total / _total_original;
    ELSE
        _kept_ratio := 1;
    END IF;

    _new_discount := ROUND(COALESCE(_original_order.discount_amount, 0) * _kept_ratio);
    _return_discount := COALESCE(_original_order.discount_amount, 0) - _new_discount;
    -- COR-9: delivery is NOT part of `price` (it stays in delivery_fee).
    _new_price := _kept_total - _new_discount;
    _return_price := _returned_total - _return_discount;

    UPDATE public.orders
    SET items = _kept_items,
        price = _new_price,
        discount_amount = _new_discount,
        status = 'delivered',
        delivered_at = NOW()
    WHERE id = _original_order_id;

    _return_order_data := (to_jsonb(_original_order)
        || jsonb_build_object(
            'items', _returned_items,
            'price', _return_price,
            'discount_amount', _return_discount,
            'status', 'rejected',
            'is_return', true,
            'original_order_id', _original_order.id,
            'rejection_reason', 'Partial Return'
        ))
        - 'id' - 'created_at' - 'updated_at' - 'order_id'
        - 'last_batch_id' - 'delivery_order_id' - 'sequence_number'
        - 'delivered_at' - 'cancelled_at' - 'printed_at' - 'print_count'
        - 'tenant_id';

    _created_return_order := create_order_atomic(_return_order_data, _tenant_id);

    -- WF-2: record exactly what this rewrote on the original, plus which return
    -- order it created, so the split can be reversed while that return is
    -- still untouched.
    INSERT INTO public.order_split_log
        (tenant_id, original_order_id, return_order_id, original_before)
    VALUES (
        coalesce(_tenant_id, _original_order.tenant_id),
        _original_order_id,
        (_created_return_order->>'id')::uuid,
        jsonb_build_object(
            'items', _original_order.items,
            'price', _original_order.price,
            'discount_amount', _original_order.discount_amount,
            'status', _original_order.status,
            'delivered_at', _original_order.delivered_at
        )
    )
    RETURNING id INTO _split_log_id;

    RETURN _created_return_order || jsonb_build_object('split_log_id', _split_log_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.split_order_atomic(_original_order_id uuid, _kept_items jsonb, _returned_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'split_order_atomic/3 is deprecated - call the 4-arg version with an explicit tenant_id' USING ERRCODE = '42501';
    END IF;
    RETURN public.split_order_atomic(_original_order_id, _kept_items, _returned_items, NULL::uuid);
END;
$function$;

REVOKE ALL ON FUNCTION public.split_order_atomic(uuid, jsonb, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.split_order_atomic(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.split_order_atomic(uuid, jsonb, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.split_order_atomic(uuid, jsonb, jsonb) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- create_storefront_order (live since 20261021142000) and what it reads
-- ---------------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
    ADD COLUMN IF NOT EXISTS is_test boolean DEFAULT false;

CREATE OR REPLACE FUNCTION public.normalize_phone(input_phone text)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE clean_phone TEXT;
BEGIN
  clean_phone := translate(input_phone, '٠١٢٣٤٥٦٧٨٩', '0123456789');
  clean_phone := translate(clean_phone, '۰۱۲۳۴۵۶۷۸۹', '0123456789');
  clean_phone := regexp_replace(clean_phone, '\D', '', 'g');
  IF clean_phone LIKE '964%' THEN clean_phone := substring(clean_phone FROM 4); END IF;
  IF clean_phone LIKE '0%' THEN clean_phone := substring(clean_phone FROM 2); END IF;
  RETURN clean_phone;
END; $function$;

CREATE OR REPLACE FUNCTION public.loyalty_phone_key(_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT CASE WHEN n ~ '^7[0-9]{9}$' THEN '0' || n END
  FROM (SELECT public.normalize_phone(_phone) AS n) x;
$function$;

CREATE OR REPLACE FUNCTION public.create_storefront_order(
  _order_data jsonb,
  _tenant_id uuid,
  _paid_product_ids uuid[],
  _duplicate_window_minutes integer
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _idem text := NULLIF(_order_data->>'idempotency_key', '');
  _phone_key text := public.loyalty_phone_key(_order_data->>'phone');
  _existing jsonb;
BEGIN
  IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: storefront checkout only' USING ERRCODE = '42501';
  END IF;
  IF _tenant_id IS NULL THEN
    RAISE EXCEPTION 'create_storefront_order: _tenant_id is required' USING ERRCODE = '22004';
  END IF;
  IF _duplicate_window_minutes IS NULL OR _duplicate_window_minutes <= 0 THEN
    RAISE EXCEPTION 'create_storefront_order: _duplicate_window_minutes must be positive' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('create_order_lock')::bigint);

  -- A key this tenant has seen is create_order_atomic's to answer: a same-key
  -- resend must get ITS order back as a replay, never a "duplicate".
  IF _idem IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders WHERE tenant_id = _tenant_id AND idempotency_key = _idem
  ) THEN
    RETURN public.create_order_atomic(_order_data, _tenant_id);
  END IF;

  -- The array-length check matters: an empty product list would make the
  -- "every product is in that order" test vacuously true.
  IF _phone_key IS NOT NULL AND coalesce(array_length(_paid_product_ids, 1), 0) > 0 THEN
    SELECT to_jsonb(o.*) INTO _existing
      FROM public.orders o
     WHERE o.tenant_id = _tenant_id
       AND public.loyalty_phone_key(o.phone) = _phone_key
       AND o.deleted_at IS NULL
       AND coalesce(o.is_test, false) = false
       AND o.status NOT IN ('pending_checkout', 'cancelled', 'rejected')
       AND o.created_at > now() - make_interval(mins => _duplicate_window_minutes)
       AND NOT EXISTS (
         SELECT 1
           FROM unnest(_paid_product_ids) AS wanted(product_id)
          WHERE NOT EXISTS (
            SELECT 1
              FROM jsonb_array_elements(
                     CASE WHEN jsonb_typeof(o.items) = 'array' THEN o.items ELSE '[]'::jsonb END
                   ) AS line(item)
             WHERE line.item->>'product_id' = wanted.product_id::text
          )
       )
     ORDER BY o.created_at DESC
     LIMIT 1;

    IF _existing IS NOT NULL THEN
      RETURN _existing || jsonb_build_object('idempotent_replay', true, 'duplicate_guard', true);
    END IF;
  END IF;

  RETURN public.create_order_atomic(_order_data, _tenant_id);
END;
$function$;

-- Supabase grants new public functions to anon/authenticated by default
-- privileges, and a PUBLIC grant survives a REVOKE FROM anon — revoke all three.
REVOKE ALL ON FUNCTION public.create_storefront_order(jsonb, uuid, uuid[], integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_storefront_order(jsonb, uuid, uuid[], integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_storefront_order(jsonb, uuid, uuid[], integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Data: two tenants, one active member each, and today's existing orders
-- ---------------------------------------------------------------------------
INSERT INTO public.tenants (id, name) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000001', 'Tenant A'),
    ('bbbbbbbb-0000-4000-8000-000000000002', 'Tenant B');
INSERT INTO public.user_profiles (id) VALUES
    ('aaaaaaaa-1111-4000-8000-000000000001'),
    ('bbbbbbbb-1111-4000-8000-000000000002');
INSERT INTO public.tenant_members (tenant_id, user_id, role) VALUES
    ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-1111-4000-8000-000000000001', 'employee'),
    ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-1111-4000-8000-000000000002', 'employee');

-- Today: storefront prefix 4 at 001..005 across both tenants, whatsapp
-- prefix 1 at 007, plus an unrelated LightFunnels-style number and a row that
-- shares the prefix but not the format (the old MAX() also read those).
INSERT INTO public.orders (order_id, customer_name, phone, price, source, tenant_id, sequence_number)
SELECT '4' || to_char(current_date, 'YYMMDD') || lpad(n::text, 3, '0'), 'seed', '07700000000', 1000, 'storefront',
       CASE WHEN n % 2 = 0 THEN 'aaaaaaaa-0000-4000-8000-000000000001'::uuid ELSE 'bbbbbbbb-0000-4000-8000-000000000002'::uuid END, n
  FROM generate_series(1, 5) n;
INSERT INTO public.orders (order_id, customer_name, phone, price, source, tenant_id, sequence_number) VALUES
    ('1' || to_char(current_date, 'YYMMDD') || '007', 'seed', '07700000000', 1000, 'whatsapp', 'aaaaaaaa-0000-4000-8000-000000000001', 10),
    ('LF-SHOP-000123', 'seed', '07700000000', 1000, 'lightfunnels', 'aaaaaaaa-0000-4000-8000-000000000001', 11),
    ('2' || to_char(current_date, 'YYMMDD') || '-B4', 'seed', '07700000000', 1000, 'meta', 'bbbbbbbb-0000-4000-8000-000000000002', 12);
