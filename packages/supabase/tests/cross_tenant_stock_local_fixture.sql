-- =============================================================================
-- Local fixture for cross_tenant_stock.sql (findings F-001 / F-002)
-- =============================================================================
--
-- LOCAL THROWAWAY POSTGRES ONLY. Never run against Supabase: it creates roles,
-- schemas, tables and functions.
--
-- Recreates the minimal slice of live sduvpgqwhxragxtxztur involved, with the
-- PRE-FIX definitions copied from live (pg_get_functiondef / pg_policies /
-- pg_trigger, read 2026-10-20): auth.uid/role stubs, get_user_tenant_ids,
-- inv_phase, inv_apply, inv_order_changed + trg_inv_order_changed,
-- process_return, undo_return, both create_order_atomic overloads, and the
-- tenant / public read policies of products and the six product child tables.
-- Only the columns these functions and policies touch are created.
--
-- HOW TO RUN (see cross_tenant_stock.sql)
--   psql -d <scratch db> -v ON_ERROR_STOP=1 -f cross_tenant_stock_local_fixture.sql
-- =============================================================================

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE SCHEMA IF NOT EXISTS auth;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  select
  coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;

CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled', 'limited');
CREATE TYPE public.member_status AS ENUM ('active', 'invited', 'inactive');

CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status public.tenant_status NOT NULL DEFAULT 'active'
);
CREATE TABLE public.user_profiles (id uuid PRIMARY KEY, is_active boolean DEFAULT true);
CREATE TABLE public.tenant_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  user_id uuid NOT NULL,
  -- Live since 20261020215422_tenant_role_source_of_truth.
  role text NOT NULL DEFAULT 'employee'
    CONSTRAINT tenant_members_role_check CHECK (role IN ('admin', 'employee', 'viewer')),
  status public.member_status NOT NULL DEFAULT 'active'
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  stock_quantity integer DEFAULT 0,
  reserved_quantity integer NOT NULL DEFAULT 0,
  open_box_quantity integer NOT NULL DEFAULT 0,
  is_visible boolean DEFAULT true,
  is_archived boolean DEFAULT false,
  is_supply boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active'
);
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id),
  name text,
  cost numeric,
  stock_quantity integer DEFAULT 0,
  reserved_quantity integer DEFAULT 0,
  open_box_quantity integer NOT NULL DEFAULT 0
);
CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  display_order integer DEFAULT 0
);
CREATE TABLE public.product_bundle_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  child_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE
);
CREATE TABLE public.product_related (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  related_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE
);
CREATE TABLE public.product_order_bumps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  bump_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  is_active boolean NOT NULL DEFAULT true
);
CREATE TABLE public.product_tiered_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  min_quantity integer NOT NULL DEFAULT 1
);

CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  order_id text NOT NULL UNIQUE,
  customer_name text NOT NULL,
  phone text NOT NULL,
  city text,
  governorate_code text,
  address_details text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  price numeric NOT NULL,
  status text NOT NULL DEFAULT 'new',
  notes text,
  rejection_reason text,
  priority text DEFAULT 'normal',
  payment_status text DEFAULT 'cod',
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
  last_status_changed_by_name text DEFAULT 'System',
  last_status_changed_by_avatar text,
  tenant_id uuid,
  idempotency_key text,
  attribution jsonb,
  ad_channel text
);
CREATE TABLE public.order_status_history (
  id uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
  order_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  tenant_id uuid
);
CREATE TABLE public.inventory_ledger (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  delta_reserved integer NOT NULL DEFAULT 0,
  delta_stock integer NOT NULL DEFAULT 0,
  delta_open_box integer NOT NULL DEFAULT 0,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;

-- ---- live: get_user_tenant_ids, inv_phase ----------------------------------
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

CREATE OR REPLACE FUNCTION public.inv_phase(p_status text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN p_status = 'confirmed'                              THEN 'RESERVED'
    WHEN p_status IN ('in_transit','delivered','completed')  THEN 'FULFILLED'
    ELSE 'CLOSED'
  END;
$function$;

-- ---- live (pre-fix): inv_apply ----------------------------------------------
CREATE OR REPLACE FUNCTION public.inv_apply(p_order_id uuid, p_items jsonb, p_status text, p_sign integer, p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_phase text := public.inv_phase(p_status);
    v_item jsonb; v_pid uuid; v_vid uuid; v_qty integer; v_is_ob boolean;
BEGIN
    IF v_phase = 'CLOSED' THEN RETURN; END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN RETURN; END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_qty := COALESCE(round((v_item->>'quantity')::numeric)::integer, 0);
        IF v_qty = 0 THEN CONTINUE; END IF;
        v_is_ob := COALESCE((v_item->>'is_open_box')::boolean, false);
        v_vid := NULL; v_pid := NULL;
        IF nullif(v_item->>'variant_id','') IS NOT NULL
           AND (v_item->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            v_vid := (v_item->>'variant_id')::uuid;
        ELSIF nullif(v_item->>'product_id','') IS NOT NULL
              AND (v_item->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            v_pid := (v_item->>'product_id')::uuid;
        ELSE CONTINUE; END IF;

        IF v_is_ob THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants SET open_box_quantity = COALESCE(open_box_quantity,0) - p_sign * v_qty WHERE id = v_vid;
            ELSE
                UPDATE public.products SET open_box_quantity = COALESCE(open_box_quantity,0) - p_sign * v_qty WHERE id = v_pid;
            END IF;
            INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
            VALUES (p_tenant_id, v_pid, v_vid, p_order_id, 0, 0, -(p_sign * v_qty),
                    'trigger:OPEN_BOX:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END));
        ELSIF v_phase = 'RESERVED' THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants SET reserved_quantity = COALESCE(reserved_quantity,0) + p_sign * v_qty WHERE id = v_vid;
            ELSE
                UPDATE public.products SET reserved_quantity = COALESCE(reserved_quantity,0) + p_sign * v_qty WHERE id = v_pid;
            END IF;
            INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
            VALUES (p_tenant_id, v_pid, v_vid, p_order_id, p_sign * v_qty, 0, 0,
                    'trigger:RESERVED:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END));
        ELSIF v_phase = 'FULFILLED' THEN
            IF v_vid IS NOT NULL THEN
                UPDATE public.product_variants SET stock_quantity = COALESCE(stock_quantity,0) - p_sign * v_qty WHERE id = v_vid;
            ELSE
                UPDATE public.products SET stock_quantity = COALESCE(stock_quantity,0) - p_sign * v_qty WHERE id = v_pid;
            END IF;
            INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
            VALUES (p_tenant_id, v_pid, v_vid, p_order_id, 0, -(p_sign * v_qty), 0,
                    'trigger:FULFILLED:' || (CASE WHEN p_sign > 0 THEN 'apply' ELSE 'reverse' END));
        END IF;
    END LOOP;
END;
$function$;

-- ---- live: inv_order_changed + trigger --------------------------------------
CREATE OR REPLACE FUNCTION public.inv_order_changed()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF tg_op = 'INSERT' THEN
        PERFORM public.inv_apply(new.id, new.items, new.status, 1, new.tenant_id);
        RETURN new;
    ELSIF tg_op = 'DELETE' THEN
        PERFORM public.inv_apply(NULL, old.items, old.status, -1, old.tenant_id);
        RETURN old;
    ELSIF tg_op = 'UPDATE' THEN
        IF old.status IS DISTINCT FROM new.status OR old.items IS DISTINCT FROM new.items THEN
            PERFORM public.inv_apply(old.id, old.items, old.status, -1, old.tenant_id);
            PERFORM public.inv_apply(new.id, new.items, new.status,  1, new.tenant_id);
        END IF;
        RETURN new;
    END IF;
    RETURN NULL;
END;
$function$;
CREATE TRIGGER trg_inv_order_changed AFTER INSERT OR DELETE OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.inv_order_changed();

-- ---- live (pre-fix): process_return -----------------------------------------
CREATE OR REPLACE FUNCTION public.process_return(_order_id uuid, _tenant_id uuid, _reason_label text, _changed_by_name text, _changed_by_avatar text, _destinations jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_prev_status text;
    v_order_tenant uuid;
    d    jsonb;
    pid  uuid;
    vid  uuid;
    qty  integer;
    dest text;
BEGIN

    -- >>> SEC-4 GUARD
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: tenant membership required'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    -- <<< SEC-4 GUARD
    SELECT status, tenant_id INTO v_prev_status, v_order_tenant
      FROM public.orders WHERE id = _order_id;

    IF v_prev_status IS NULL THEN
        RAISE EXCEPTION 'order % not found', _order_id;
    END IF;

    IF v_order_tenant IS DISTINCT FROM _tenant_id THEN
        RAISE EXCEPTION 'tenant mismatch: caller=% order=%', _tenant_id, v_order_tenant;
    END IF;

    UPDATE public.orders
       SET status = 'rejected',
           rejection_reason = _reason_label,
           last_status_changed_by_name = _changed_by_name,
           last_status_changed_by_avatar = _changed_by_avatar,
           updated_at = now()
     WHERE id = _order_id;

    INSERT INTO public.order_status_history(order_id, from_status, to_status, changed_at, notes, changed_by, tenant_id)
    VALUES (_order_id, v_prev_status, 'rejected', now(), _reason_label, _changed_by_name, _tenant_id);

    IF _destinations IS NOT NULL AND jsonb_typeof(_destinations) = 'array' THEN
        FOR d IN SELECT value FROM jsonb_array_elements(_destinations)
        LOOP
            qty  := COALESCE(round((d->>'quantity')::numeric)::integer, 0);
            dest := d->>'dest';
            IF qty <= 0 THEN CONTINUE; END IF;

            vid := NULL; pid := NULL;
            IF nullif(d->>'variant_id','') IS NOT NULL
               AND (d->>'variant_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
                vid := (d->>'variant_id')::uuid;
            ELSIF nullif(d->>'product_id','') IS NOT NULL
                  AND (d->>'product_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
                pid := (d->>'product_id')::uuid;
            ELSE
                CONTINUE;
            END IF;

            IF dest = 'write_off' THEN
                IF vid IS NOT NULL THEN
                    UPDATE public.product_variants SET stock_quantity = GREATEST(0, stock_quantity - qty) WHERE id = vid;
                ELSE
                    UPDATE public.products         SET stock_quantity = GREATEST(0, stock_quantity - qty) WHERE id = pid;
                END IF;
                INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
                VALUES (_tenant_id, pid, vid, _order_id, 0, -qty, 0, 'return:write_off');

            ELSIF dest = 'open_box' THEN
                IF vid IS NOT NULL THEN
                    UPDATE public.product_variants
                       SET stock_quantity    = GREATEST(0, stock_quantity - qty),
                           open_box_quantity = COALESCE(open_box_quantity,0) + qty
                     WHERE id = vid;
                ELSE
                    UPDATE public.products
                       SET stock_quantity    = GREATEST(0, stock_quantity - qty),
                           open_box_quantity = COALESCE(open_box_quantity,0) + qty
                     WHERE id = pid;
                END IF;
                INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
                VALUES (_tenant_id, pid, vid, _order_id, 0, -qty, qty, 'return:open_box');

            ELSE
                INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
                VALUES (_tenant_id, pid, vid, _order_id, 0, 0, 0, 'return:restock');
            END IF;
        END LOOP;
    END IF;
END;
$function$;

-- ---- live (pre-fix): undo_return --------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_return(_order_id uuid, _tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_prev_status text;
    v_order_tenant uuid;
    v_cutoff timestamptz;
    r RECORD;
BEGIN
    -- >>> SEC-4 GUARD
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        IF _tenant_id IS NULL OR _tenant_id NOT IN (SELECT public.get_user_tenant_ids()) THEN
            RAISE EXCEPTION 'Unauthorized: tenant membership required'
                USING ERRCODE = '42501';
        END IF;
    END IF;
    -- <<< SEC-4 GUARD

    SELECT status, tenant_id INTO v_prev_status, v_order_tenant
      FROM public.orders WHERE id = _order_id;

    IF v_prev_status IS NULL THEN
        RAISE EXCEPTION 'order % not found', _order_id;
    END IF;

    IF v_order_tenant IS DISTINCT FROM _tenant_id THEN
        RAISE EXCEPTION 'tenant mismatch: caller=% order=%', _tenant_id, v_order_tenant;
    END IF;

    IF v_prev_status <> 'rejected' THEN
        RAISE EXCEPTION 'undo_return: order % is not in rejected state (status=%)', _order_id, v_prev_status;
    END IF;

    SELECT MAX(created_at) INTO v_cutoff
      FROM public.inventory_ledger
     WHERE order_id = _order_id
       AND reason LIKE 'return:%';

    IF v_cutoff IS NULL THEN
        UPDATE public.orders SET status = 'confirmed', rejection_reason = NULL, updated_at = now() WHERE id = _order_id;
        RETURN;
    END IF;

    FOR r IN
        SELECT product_id, variant_id, delta_stock, delta_open_box, reason
          FROM public.inventory_ledger
         WHERE order_id = _order_id
           AND reason LIKE 'return:%'
           AND created_at >= v_cutoff - INTERVAL '1 second'
    LOOP
        IF r.reason = 'return:write_off' THEN
            IF r.variant_id IS NOT NULL THEN
                UPDATE public.product_variants SET stock_quantity = stock_quantity + (-r.delta_stock) WHERE id = r.variant_id;
            ELSIF r.product_id IS NOT NULL THEN
                UPDATE public.products         SET stock_quantity = stock_quantity + (-r.delta_stock) WHERE id = r.product_id;
            END IF;
        ELSIF r.reason = 'return:open_box' THEN
            IF r.variant_id IS NOT NULL THEN
                UPDATE public.product_variants
                   SET stock_quantity    = stock_quantity + (-r.delta_stock),
                       open_box_quantity = GREATEST(0, open_box_quantity - r.delta_open_box)
                 WHERE id = r.variant_id;
            ELSIF r.product_id IS NOT NULL THEN
                UPDATE public.products
                   SET stock_quantity    = stock_quantity + (-r.delta_stock),
                       open_box_quantity = GREATEST(0, open_box_quantity - r.delta_open_box)
                 WHERE id = r.product_id;
            END IF;
        END IF;

        INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
        VALUES (_tenant_id, r.product_id, r.variant_id, _order_id, 0, -r.delta_stock, -r.delta_open_box, 'undo_return:' || r.reason);
    END LOOP;

    UPDATE public.orders
       SET status = 'confirmed',
           rejection_reason = NULL,
           updated_at = now()
     WHERE id = _order_id;

    INSERT INTO public.order_status_history(order_id, from_status, to_status, changed_at, notes, changed_by, tenant_id)
    VALUES (_order_id, 'rejected', 'confirmed', now(), 'undo_return', NULL, _tenant_id);
END;
$function$;

-- ---- live: create_order_atomic (both overloads, unchanged by the fix) -------
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
    SELECT to_jsonb(orders.*) INTO _result FROM public.orders
     WHERE idempotency_key = _idem AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
     LIMIT 1;
    IF _result IS NOT NULL THEN RETURN _result; END IF;
  END IF;

  _generated_order_id := _order_data->>'order_id';
  IF _generated_order_id IS NULL OR _generated_order_id = '' THEN
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
    CASE WHEN jsonb_typeof(_order_data->'attribution') = 'object' THEN _order_data->'attribution' ELSE NULL END,
    NULLIF(_order_data->>'ad_channel', ''),
    _idem, _tenant_id
  RETURNING to_jsonb(orders.*) INTO _result;
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

-- live ACLs
REVOKE ALL ON FUNCTION public.inv_apply(uuid, jsonb, text, integer, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inv_order_changed() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_return(uuid, uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.undo_return(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_order_atomic(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inv_apply(uuid, jsonb, text, integer, uuid), public.inv_order_changed() TO service_role;
GRANT EXECUTE ON FUNCTION public.process_return(uuid, uuid, text, text, text, jsonb), public.undo_return(uuid, uuid),
  public.create_order_atomic(jsonb, uuid), public.create_order_atomic(jsonb), public.get_user_tenant_ids()
  TO authenticated, service_role;

-- ---- live RLS ---------------------------------------------------------------
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_read ON public.tenants FOR SELECT USING (true);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_select ON public.orders FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_insert ON public.orders FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_update ON public.orders FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids())) WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_delete ON public.orders FOR DELETE USING (tenant_id IN (SELECT get_user_tenant_ids()));

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_storefront_read_products ON public.products FOR SELECT
  USING ((is_visible = true) AND (is_archived = false) AND (is_supply IS NOT TRUE) AND (EXISTS ( SELECT 1
   FROM tenants t WHERE ((t.id = products.tenant_id) AND (t.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status]))))));
CREATE POLICY tenant_isolation_select ON public.products FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_insert ON public.products FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_update ON public.products FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids())) WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_delete ON public.products FOR DELETE USING (tenant_id IN (SELECT get_user_tenant_ids()));

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_storefront_read_product_images ON public.product_images FOR SELECT
  USING (EXISTS ( SELECT 1 FROM products p WHERE (p.id = product_images.product_id)));
CREATE POLICY tenant_isolation_select ON public.product_images FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_insert ON public.product_images FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_update ON public.product_images FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids())) WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_delete ON public.product_images FOR DELETE USING (tenant_id IN (SELECT get_user_tenant_ids()));

ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_storefront_read_product_variants ON public.product_variants FOR SELECT
  USING (EXISTS ( SELECT 1 FROM products p WHERE (p.id = product_variants.product_id)));
CREATE POLICY tenant_isolation_select ON public.product_variants FOR SELECT TO authenticated USING (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_insert ON public.product_variants FOR INSERT WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_update ON public.product_variants FOR UPDATE USING (tenant_id IN (SELECT get_user_tenant_ids())) WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()));
CREATE POLICY tenant_isolation_delete ON public.product_variants FOR DELETE USING (tenant_id IN (SELECT get_user_tenant_ids()));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['product_bundle_items','product_related','product_order_bumps','product_tiered_pricing'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation_all ON public.%I FOR ALL TO authenticated
      USING (tenant_id IN (SELECT get_user_tenant_ids())) WITH CHECK (tenant_id IN (SELECT get_user_tenant_ids()))$p$, t);
    EXECUTE format($p$CREATE POLICY public_storefront_read ON public.%1$I FOR SELECT TO anon, authenticated
      USING (EXISTS ( SELECT 1 FROM (products p JOIN tenants tn ON ((tn.id = p.tenant_id)))
        WHERE ((p.id = %1$I.product_id) AND (p.is_visible = true) AND (p.is_archived = false) AND (p.is_supply IS NOT TRUE)
          AND (tn.status = ANY (ARRAY['trial'::tenant_status, 'active'::tenant_status])))))$p$, t);
  END LOOP;
END $$;
