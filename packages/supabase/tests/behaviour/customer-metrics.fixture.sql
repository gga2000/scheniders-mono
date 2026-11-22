-- Throwaway Postgres database shaped like the live objects behind customer
-- numbers (B9 step 3): orders with every column customer_order_facts reads,
-- order_status_history, the helpers the facts read, customer_order_facts and
-- mv_customer_metrics as live (a materialized view, before the change), the
-- customer_aggregates view and the refresh jobs' state table. Copied from
-- live (2026-11-22). Seeded with three shops of customers in mixed phone
-- formats, replacements, returns, refunds, deleted, archived and test orders
-- over a year, every order at its own time (the latest order wins on time).
-- NEVER run this against Supabase.

CREATE SCHEMA extensions;
CREATE EXTENSION pg_trgm WITH SCHEMA extensions;

CREATE TYPE public.refund_status AS ENUM ('none', 'pending', 'refunded', 'failed', 'partial');

CREATE TABLE public.orders (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    order_id text NOT NULL,
    customer_name text NOT NULL,
    phone text NOT NULL,
    city text,
    governorate_code text,
    address_details text,
    items jsonb NOT NULL DEFAULT '[]'::jsonb,
    price numeric NOT NULL,
    status text NOT NULL DEFAULT 'new'::text,
    whatsapp_link text,
    notes text,
    rejection_reason text,
    scheduled_date date,
    priority text DEFAULT 'normal'::text,
    payment_status text DEFAULT 'cod'::text,
    delivery_fee numeric DEFAULT 0,
    discount_amount numeric DEFAULT 0,
    is_return boolean DEFAULT false,
    original_order_id uuid,
    is_archived boolean DEFAULT false,
    secondary_phone text,
    delivery_slot text,
    source text,
    sequence_number integer,
    delivered_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    printed_at timestamp with time zone,
    print_count integer DEFAULT 0,
    last_batch_id uuid,
    is_gift boolean DEFAULT false,
    tag_color text,
    is_pinned boolean DEFAULT false,
    delivery_order_id text,
    is_reviewed boolean DEFAULT false,
    is_verified_customer boolean DEFAULT false,
    contact_count integer DEFAULT 0,
    address_status text DEFAULT 'needs_review'::text,
    address_issues text[] DEFAULT '{}'::text[],
    validated_governorate_code text,
    internal_notes text,
    assigned_to uuid,
    assigned_at timestamp with time zone,
    product_cost numeric,
    net_profit numeric,
    is_shop_order boolean DEFAULT false,
    risk_metadata jsonb DEFAULT '{}'::jsonb,
    needs_attention boolean DEFAULT false,
    attention_reasons text[] DEFAULT '{}'::text[],
    original_created_at timestamp with time zone,
    last_contacted_at timestamp with time zone,
    last_status_changed_by_name text DEFAULT 'System'::text,
    last_status_changed_by_avatar text,
    is_test boolean DEFAULT false,
    delivery_note text,
    is_replacement boolean DEFAULT false,
    delivery_company text,
    waseet_qr_id text,
    waseet_qr_link text,
    waseet_status_id integer,
    waseet_status_text text,
    waseet_merchant_price numeric,
    waseet_company_price numeric,
    waseet_submitted_at timestamp with time zone,
    waseet_invoice_id text,
    completed_at timestamp with time zone,
    tenant_id uuid NOT NULL,
    refund_status refund_status NOT NULL DEFAULT 'none'::refund_status,
    refunded_at timestamp with time zone,
    reason_id uuid,
    deleted_at timestamp with time zone,
    idempotency_key text,
    waseet_submit_started_at timestamp with time zone,
    whatsapp_contact_slot text,
    last_followup_by_name text,
    last_followup_by_avatar text,
    last_followup_at timestamp with time zone,
    last_followup_type text,
    attribution jsonb,
    ad_channel text,
    confirmation_dispatched_at timestamp with time zone,
    refunded_amount integer NOT NULL DEFAULT 0,
    entered_by uuid,
    prime_district jsonb,
    take_kind text,
    taken_by text,
    shield_snapshot jsonb,
    shop_id uuid,
    till_session_id uuid,
    shield_excused boolean NOT NULL DEFAULT false,
    guide_practice boolean NOT NULL DEFAULT false,
    refund_paid_at timestamp with time zone,
    billing_phase text,
    courier_name text,
    version integer NOT NULL DEFAULT 1,
    delivered_source text,
    abandoned_cart_at timestamp with time zone,
    abandoned_cart_outcome text,
    abandoned_cart_resolved_at timestamp with time zone,
    abandoned_cart_resolved_by_name text,
    abandoned_cart_order_id uuid,
    item_unit_costs numeric[],
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    tag_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
    created_via text
,
    PRIMARY KEY (id),
    FOREIGN KEY (original_order_id) REFERENCES public.orders(id) ON DELETE SET NULL
);

CREATE TABLE public.order_status_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
    from_status text,
    to_status text,
    changed_by text,
    changed_at timestamptz DEFAULT now(),
    notes text,
    tenant_id uuid
);
CREATE INDEX idx_order_status_history_order_id ON public.order_status_history (order_id);

CREATE TABLE public.cron_refresh_state (
    job text PRIMARY KEY,
    fingerprint bigint NOT NULL,
    refreshed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.cron_refresh_state (job, fingerprint) VALUES ('tenant_public_stats', 1), ('customer_aggregates', 1);

-- As live; customer-metrics.functions loads the newest copies on top.
CREATE OR REPLACE FUNCTION public.search_fold_phone(_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.regexp_replace(
             pg_catalog.regexp_replace(
               pg_catalog.regexp_replace(
                 pg_catalog.regexp_replace(pg_catalog.translate(_phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g'),
               '^00', ''),
             '^964', ''),
           '^0', '');
$function$
;
CREATE OR REPLACE FUNCTION public.search_fold_arabic(_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.lower(pg_catalog.btrim(
        pg_catalog.translate(
            pg_catalog.regexp_replace(
                pg_catalog.regexp_replace(_text,
                    '[' OPERATOR(pg_catalog.||) pg_catalog.chr(1611) OPERATOR(pg_catalog.||) '-'
                        OPERATOR(pg_catalog.||) pg_catalog.chr(1631) OPERATOR(pg_catalog.||) pg_catalog.chr(1600)
                        OPERATOR(pg_catalog.||) ']',
                    '', 'g'),
                pg_catalog.chr(1648), '', 'g'),
            'آأإٱةىیکەۀ',
            'ااااهييكهه'
        )
    ));
$function$
;
CREATE OR REPLACE FUNCTION public.normalize_arabic_text_for_search(_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'public'
AS $function$
    SELECT public.search_fold_arabic(_text);
$function$
;
CREATE OR REPLACE FUNCTION public.normalize_phone_for_search(_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'public'
AS $function$
    SELECT public.search_fold_phone(_phone);
$function$
;
CREATE OR REPLACE FUNCTION public.order_base_id(_order_id text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
    SELECT CASE
        WHEN _order_id IS NULL OR _order_id = '' THEN ''
        WHEN _order_id ~ 'LF-(\d+)-\d+$' THEN (regexp_match(_order_id, 'LF-(\d+)-\d+$'))[1]
        WHEN _order_id LIKE 'DLV-%' THEN overlay(_order_id placing '' from 1 for 4)
        WHEN _order_id ~ '\d' THEN (regexp_match(_order_id, '\d+'))[1]
        ELSE _order_id
    END;
$function$
;
CREATE OR REPLACE FUNCTION public.order_was_delivered(p_order_id uuid, p_delivered_at timestamp with time zone)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
    SELECT p_delivered_at IS NOT NULL
        OR EXISTS (SELECT 1 FROM public.order_status_history h
                    WHERE h.order_id = p_order_id
                      AND (h.to_status IN ('delivered', 'completed')
                           OR h.from_status IN ('delivered', 'completed')));
$function$
;

-- As live: the refresh jobs' count of orders writes.
CREATE FUNCTION public.orders_write_fingerprint() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
    select coalesce(n_tup_ins, 0) + coalesce(n_tup_upd, 0) + coalesce(n_tup_del, 0)
    from pg_stat_user_tables
    where relid = 'public.orders'::regclass;
$function$;

-- Stub: customer_aggregates only needs it to exist.
CREATE FUNCTION public.get_user_tenant_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE AS $$ SELECT NULL::uuid WHERE false $$;

CREATE INDEX idx_orders_tenant_live_phone_norm ON public.orders USING btree (tenant_id, public.normalize_phone_for_search(phone)) INCLUDE (phone, created_at, is_test) WHERE (deleted_at IS NULL);
CREATE INDEX idx_orders_original_order_id ON public.orders USING btree (original_order_id) WHERE (original_order_id IS NOT NULL);
CREATE INDEX idx_orders_created_at ON public.orders USING btree (created_at DESC);

-- Seed, before the views as live had them over existing orders.
DO $seed$
DECLARE
    v_tenants uuid[] := ARRAY['00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000a3']::uuid[];
    v_statuses text[] := ARRAY['pending', 'confirmed', 'shipped', 'delivered', 'delivered', 'delivered', 'completed',
                               'cancelled', 'rejected', 'no_response', 'return_pending', 'pending_checkout'];
    v_seq int := 0;
    v_tenant uuid;
    v_phone text;
    v_id uuid;
    v_status text;
    v_price numeric;
    v_at timestamptz;
BEGIN
    PERFORM setseed(0.42);
    FOREACH v_tenant IN ARRAY v_tenants LOOP
        FOR c IN 1..70 LOOP
            FOR n IN 1..(1 + floor(random() * 5))::int LOOP
                v_seq := v_seq + 1;
                -- One customer, several ways of writing the number.
                v_phone := (ARRAY['0770', '+964 770 ', '964770', '00964770'])[1 + floor(random() * 4)::int]
                           || lpad(c::text, 7, '0');
                v_status := v_statuses[1 + floor(random() * array_length(v_statuses, 1))::int];
                v_price := (40 + floor(random() * 320)) * 250;
                -- About 14 months back, every order at its own minute.
                v_at := now() - make_interval(mins => v_seq * 587 + 3);
                v_id := gen_random_uuid();
                INSERT INTO public.orders (id, tenant_id, order_id, customer_name, phone, city, governorate_code,
                                           secondary_phone, address_details, price, items, status, created_at,
                                           delivered_at, deleted_at, is_archived, is_test, refund_status, refunded_at)
                VALUES (v_id, v_tenant, 'S-' || (10000 + v_seq), 'Customer ' || c || ' / ' || n, v_phone,
                        (ARRAY['Baghdad', 'Basra', 'Najaf', 'Erbil'])[1 + floor(random() * 4)::int],
                        (ARRAY['BGD', 'BAS', 'NJF', 'ERB'])[1 + floor(random() * 4)::int],
                        CASE WHEN random() < 0.3 THEN '0780' || lpad(c::text, 7, '0') END,
                        'street ' || n, v_price,
                        jsonb_build_array(jsonb_build_object('quantity', 1 + floor(random() * 3)::int)),
                        v_status, v_at,
                        CASE WHEN v_status IN ('delivered', 'completed') AND random() < 0.7 THEN v_at + interval '1 day' END,
                        CASE WHEN random() < 0.03 THEN v_at + interval '2 days' END,
                        random() < 0.03, random() < 0.02,
                        (CASE WHEN random() < 0.05 THEN 'pending' WHEN random() < 0.05 THEN 'refunded' ELSE 'none' END)::public.refund_status,
                        CASE WHEN random() < 0.03 THEN v_at + interval '5 days' END);
                IF v_status IN ('delivered', 'completed') THEN
                    INSERT INTO public.order_status_history (order_id, from_status, to_status, tenant_id, changed_at)
                    VALUES (v_id, 'shipped', v_status, v_tenant, v_at + interval '1 day');
                    -- Some come back: a return or a refund delivery.
                    IF random() < 0.12 THEN
                        v_seq := v_seq + 1;
                        INSERT INTO public.orders (tenant_id, order_id, customer_name, phone, price, items, status,
                                                   is_return, original_order_id, created_at)
                        VALUES (v_tenant, 'S-' || (10000 + v_seq - 1) || '-R', 'Customer ' || c, v_phone,
                                -least(v_price, (20 + floor(random() * 100)) * 250), '[]'::jsonb,
                                (ARRAY['refund_delivered', 'return_pending'])[1 + floor(random() * 2)::int],
                                true, v_id, v_at + interval '3 days 7 minutes');
                    END IF;
                ELSIF v_status IN ('rejected', 'no_response', 'cancelled') AND random() < 0.25 THEN
                    -- Delivered once, then turned back, and replaced.
                    INSERT INTO public.order_status_history (order_id, from_status, to_status, tenant_id, changed_at)
                    VALUES (v_id, 'delivered', v_status, v_tenant, v_at + interval '2 days');
                    v_seq := v_seq + 1;
                    INSERT INTO public.orders (tenant_id, order_id, customer_name, phone, price, items, status,
                                               original_order_id, is_replacement, created_at)
                    VALUES (v_tenant, 'S-' || (10000 + v_seq - 1) || '-2', 'Customer ' || c,
                            CASE WHEN random() < 0.3 THEN '0771' || lpad(c::text, 7, '0') ELSE v_phone END,
                            (ARRAY[-5000, 0, 15000])[1 + floor(random() * 3)::int],
                            '[{"quantity": 1}]'::jsonb, (ARRAY['delivered', 'pending'])[1 + floor(random() * 2)::int],
                            v_id, true, v_at + interval '4 days 11 minutes');
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;
END
$seed$;

-- As live.
CREATE VIEW public.customer_order_facts AS
 WITH src AS (
         SELECT o.id,
            o.created_at,
            o.updated_at,
            o.order_id,
            o.customer_name,
            o.phone,
            o.city,
            o.governorate_code,
            o.address_details,
            o.items,
            o.price,
            o.status,
            o.whatsapp_link,
            o.notes,
            o.rejection_reason,
            o.scheduled_date,
            o.priority,
            o.payment_status,
            o.delivery_fee,
            o.discount_amount,
            o.is_return,
            o.original_order_id,
            o.is_archived,
            o.secondary_phone,
            o.delivery_slot,
            o.source,
            o.sequence_number,
            o.delivered_at,
            o.cancelled_at,
            o.printed_at,
            o.print_count,
            o.last_batch_id,
            o.is_gift,
            o.tag_color,
            o.is_pinned,
            o.delivery_order_id,
            o.is_reviewed,
            o.is_verified_customer,
            o.contact_count,
            o.address_status,
            o.address_issues,
            o.validated_governorate_code,
            o.internal_notes,
            o.assigned_to,
            o.assigned_at,
            o.product_cost,
            o.net_profit,
            o.is_shop_order,
            o.risk_metadata,
            o.needs_attention,
            o.attention_reasons,
            o.original_created_at,
            o.last_contacted_at,
            o.last_status_changed_by_name,
            o.last_status_changed_by_avatar,
            o.is_test,
            o.delivery_note,
            o.is_replacement,
            o.delivery_company,
            o.waseet_qr_id,
            o.waseet_qr_link,
            o.waseet_status_id,
            o.waseet_status_text,
            o.waseet_merchant_price,
            o.waseet_company_price,
            o.waseet_submitted_at,
            o.waseet_invoice_id,
            o.completed_at,
            o.version,
            o.tenant_id,
            o.refund_status,
            o.refunded_at,
            o.delivered_source,
            o.reason_id,
            o.deleted_at,
            o.idempotency_key,
            o.waseet_submit_started_at,
            o.whatsapp_contact_slot,
            o.last_followup_by_name,
            o.last_followup_by_avatar,
            o.last_followup_at,
            o.last_followup_type,
            o.attribution,
            o.ad_channel,
            o.confirmation_dispatched_at,
            o.abandoned_cart_at,
            o.abandoned_cart_outcome,
            o.abandoned_cart_resolved_at,
            o.abandoned_cart_resolved_by_name,
            o.abandoned_cart_order_id,
            o.refunded_amount,
            orig.id AS orig_id,
            orig.order_id AS orig_order_id,
            orig.price AS orig_price,
                CASE
                    WHEN ex.exchanged THEN 'delivered'::text
                    ELSE o.status
                END AS eff_status,
                CASE
                    WHEN oex.exchanged THEN 'delivered'::text
                    ELSE orig.status
                END AS orig_eff_status
           FROM orders o
             LEFT JOIN orders orig ON orig.id = o.original_order_id AND orig.tenant_id = o.tenant_id AND orig.deleted_at IS NULL AND NOT COALESCE(orig.is_test, false)
             LEFT JOIN LATERAL ( SELECT true AS exchanged
                  WHERE NOT COALESCE(o.is_return, false) AND (o.status = ANY (ARRAY['rejected'::text, 'no_response'::text, 'cancelled'::text])) AND order_was_delivered(o.id, o.delivered_at) AND (EXISTS ( SELECT 1
                           FROM orders c
                          WHERE c.original_order_id = o.id AND c.tenant_id = o.tenant_id AND c.deleted_at IS NULL))) ex ON true
             LEFT JOIN LATERAL ( SELECT true AS exchanged
                  WHERE NOT COALESCE(orig.is_return, false) AND (orig.status = ANY (ARRAY['rejected'::text, 'no_response'::text, 'cancelled'::text])) AND order_was_delivered(orig.id, orig.delivered_at)) oex ON true
          WHERE o.phone IS NOT NULL AND o.deleted_at IS NULL AND NOT COALESCE(o.is_archived, false) AND NOT COALESCE(o.is_test, false) AND o.status <> 'pending_checkout'::text AND normalize_phone_for_search(o.phone) <> ''::text
        ), f AS (
         SELECT s.tenant_id,
            normalize_phone_for_search(s.phone) AS norm_phone,
            s.id,
            order_base_id(COALESCE(s.orig_order_id, s.order_id)) AS base_id,
            s.created_at,
            s.eff_status AS status,
            COALESCE(s.is_return, false) AS is_return,
            s.customer_name,
            s.city,
            s.governorate_code,
            s.secondary_phone,
            s.address_details,
            s.price,
            s.items,
            s.orig_id,
            s.orig_price,
            s.orig_eff_status,
            s.eff_status = 'refund_delivered'::text OR s.refunded_at IS NOT NULL OR (s.refund_status::text = ANY (ARRAY['pending'::text, 'refunded'::text])) AS is_refund_signal,
            NOT COALESCE(s.is_return, false) AND (s.eff_status = ANY (ARRAY['rejected'::text, 'no_response'::text])) AS is_severe
           FROM src s
        )
 SELECT tenant_id,
    norm_phone,
    id,
    base_id,
    created_at,
    status,
    is_return,
    customer_name,
    city,
    governorate_code,
    secondary_phone,
    address_details,
    NOT is_return AND orig_id IS NULL AND (status = ANY (ARRAY['completed'::text, 'delivered'::text])) AND row_number() OVER (PARTITION BY tenant_id, norm_phone, base_id, (NOT is_return AND orig_id IS NULL AND (status = ANY (ARRAY['completed'::text, 'delivered'::text]))) ORDER BY created_at, id) = 1 AS is_delivered,
        CASE
            WHEN NOT is_return AND (status = ANY (ARRAY['completed'::text, 'delivered'::text])) AND orig_id IS NULL THEN COALESCE(price, 0::numeric)
            WHEN NOT is_return AND (status = ANY (ARRAY['completed'::text, 'delivered'::text])) AND (orig_eff_status = ANY (ARRAY['completed'::text, 'delivered'::text])) THEN GREATEST(COALESCE(price, 0::numeric), - abs(COALESCE(orig_price, 0::numeric)))
            WHEN is_return AND status = 'refund_delivered'::text AND (orig_eff_status = ANY (ARRAY['completed'::text, 'delivered'::text])) THEN - LEAST(abs(COALESCE(price, 0::numeric)), abs(COALESCE(orig_price, 0::numeric)))
            ELSE 0::numeric
        END AS spend_delta,
    is_refund_signal,
        CASE
            WHEN NOT is_return AND orig_id IS NULL AND (status = ANY (ARRAY['completed'::text, 'delivered'::text])) AND jsonb_typeof(items) = 'array'::text THEN ( SELECT COALESCE(sum((e.value ->> 'quantity'::text)::numeric), 0::numeric) AS "coalesce"
               FROM jsonb_array_elements(f.items) e(value))
            ELSE 0::numeric
        END AS delivered_items,
    is_severe,
    is_refund_signal AND NOT bool_or(is_severe) OVER (PARTITION BY tenant_id, norm_phone, base_id) AS is_minor_refund
   FROM f;

CREATE MATERIALIZED VIEW public.mv_customer_metrics AS
 WITH latest AS (
         SELECT DISTINCT ON (f_1.tenant_id, f_1.norm_phone) f_1.tenant_id,
            f_1.norm_phone,
            f_1.id AS last_order_id,
            f_1.status AS last_order_status,
            f_1.customer_name AS latest_name,
            f_1.city AS latest_city,
            f_1.governorate_code AS latest_governorate,
            f_1.secondary_phone AS latest_secondary_phone,
            f_1.address_details AS latest_address_details
           FROM customer_order_facts f_1
          WHERE NOT f_1.is_return
          ORDER BY f_1.tenant_id, f_1.norm_phone, f_1.created_at DESC
        )
 SELECT f.norm_phone AS customer_phone,
    f.tenant_id,
    l.latest_name,
    l.latest_city,
    l.latest_governorate,
    count(DISTINCT f.base_id) FILTER (WHERE NOT f.is_return) AS total_orders,
    COALESCE(sum(f.spend_delta), 0::numeric) AS total_spent,
    max(f.created_at) FILTER (WHERE NOT f.is_return) AS last_order_date,
    min(f.created_at) FILTER (WHERE NOT f.is_return) AS first_order_date,
    COALESCE(sum(f.delivered_items), 0::numeric) AS total_items,
    l.last_order_id,
    l.last_order_status,
    l.latest_secondary_phone,
    l.latest_address_details,
    count(*) FILTER (WHERE f.is_delivered) AS completed_count,
    count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled'::text) AS cancelled_count,
    count(*) FILTER (WHERE NOT f.is_return AND f.status = 'no_response'::text) AS no_response_count,
    count(*) FILTER (WHERE NOT f.is_return AND f.status = 'rejected'::text) AS rejected_count,
    count(*) FILTER (WHERE f.is_return OR f.status = 'return_pending'::text) AS returned_count,
    count(DISTINCT f.base_id) FILTER (WHERE f.is_refund_signal) AS refund_count,
    count(*) FILTER (WHERE f.is_severe) AS severe_count,
    count(*) FILTER (WHERE f.is_severe AND f.created_at >= (now() - '6 mons'::interval)) AS recent_severe_count,
    count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled'::text) + count(DISTINCT f.base_id) FILTER (WHERE f.is_minor_refund) AS moderate_count,
    count(*) FILTER (WHERE NOT f.is_return AND f.status = 'cancelled'::text AND f.created_at >= (now() - '6 mons'::interval)) + count(DISTINCT f.base_id) FILTER (WHERE f.is_minor_refund AND f.created_at >= (now() - '6 mons'::interval)) AS recent_moderate_count
   FROM customer_order_facts f
     JOIN latest l ON l.tenant_id = f.tenant_id AND l.norm_phone = f.norm_phone
  GROUP BY f.tenant_id, f.norm_phone, l.latest_name, l.latest_city, l.latest_governorate, l.last_order_id, l.last_order_status, l.latest_secondary_phone, l.latest_address_details;

CREATE UNIQUE INDEX uq_mv_customer_metrics_tenant_phone ON public.mv_customer_metrics USING btree (tenant_id, customer_phone);
CREATE INDEX idx_mv_customer_metrics_tenant_last_order ON public.mv_customer_metrics USING btree (tenant_id, last_order_date DESC);
CREATE INDEX idx_mv_customer_metrics_phone ON public.mv_customer_metrics USING btree (customer_phone);
CREATE INDEX idx_mv_customer_metrics_phone_trgm ON public.mv_customer_metrics USING gin (customer_phone extensions.gin_trgm_ops);
CREATE INDEX idx_mv_customer_metrics_name_folded_trgm ON public.mv_customer_metrics USING gin (public.normalize_arabic_text_for_search(latest_name) extensions.gin_trgm_ops);
CREATE INDEX idx_mv_customer_metrics_city_folded_trgm ON public.mv_customer_metrics USING gin (public.normalize_arabic_text_for_search(latest_city) extensions.gin_trgm_ops);
REVOKE ALL ON public.mv_customer_metrics FROM PUBLIC;
GRANT ALL ON public.mv_customer_metrics TO service_role;

CREATE VIEW public.customer_aggregates AS
 SELECT customer_phone, tenant_id, latest_name, latest_city, latest_governorate, total_orders, total_spent,
    last_order_date, first_order_date, total_items, last_order_id, last_order_status, latest_secondary_phone,
    latest_address_details, completed_count, cancelled_count, no_response_count, rejected_count, returned_count,
    refund_count
   FROM public.mv_customer_metrics
  WHERE (tenant_id IN ( SELECT public.get_user_tenant_ids() AS get_user_tenant_ids));
GRANT SELECT ON public.customer_aggregates TO authenticated;
GRANT ALL ON public.customer_aggregates TO service_role;

-- As live: refresh_customer_aggregates before B9 (the migration replaces it).
CREATE FUNCTION public.refresh_customer_aggregates() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
begin
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_customer_metrics;
end;
$function$;
REVOKE ALL ON FUNCTION public.refresh_customer_aggregates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_customer_aggregates() TO service_role;
