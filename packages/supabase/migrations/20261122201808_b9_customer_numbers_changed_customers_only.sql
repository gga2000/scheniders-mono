-- B9 step 3: customer numbers (Customers page, customer card, COD risk, Shield
-- trust) recount only the customers whose orders changed.
--
-- Until now refresh-customer-aggregates rebuilt the whole materialized view
-- mv_customer_metrics every 10 minutes when any order changed: 13 s on the
-- 200-shop load copy with nothing happening and up to 42 s under load, for
-- every customer of every shop, while a handful of them had changed.
--
-- Now:
--   * customer_metrics_source is the one definition of a customer's numbers:
--     the materialized view's query, unchanged.
--   * mv_customer_metrics is a table of the same name and columns, so the
--     Customers page, the customer card, the backup and every function that
--     reads it keep working untouched. The name is historical.
--   * Triggers on orders and order_status_history queue the customers a
--     change can move: the order's customer before and after, the customer
--     of the order it replaced, and the customers of its replacements (the
--     source reads a replacement's original order, and an original reads
--     whether it was replaced).
--   * refresh-customer-aggregates (same job, same schedule) recounts the
--     queued customers one by one through the phone index, plus the
--     customers whose orders turned 6 months old since the last run (the
--     "recent" counts), and drops customers left with no orders. A queue of
--     more than 20,000 rows, or no previous run, recounts everyone instead.
-- Measured on the 200-shop load copy (290,779 customers): a quiet run 13.3 s
-- to 17 ms; a busy 10 minutes (300 new orders, 1,500 status changes), 11-42 s
-- to 0.9 s; everyone at once (the fallback) 16 s. Order saves: no measurable
-- cost (2,000 status changes 0.5-0.7 s with or without the queue trigger).

-- 1. The definition, unchanged from mv_customer_metrics.
CREATE VIEW public.customer_metrics_source WITH (security_invoker = true) AS
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

REVOKE ALL ON public.customer_metrics_source FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON VIEW public.customer_metrics_source IS
    'Every customer''s numbers, computed from orders. refresh_customer_aggregates keeps the table mv_customer_metrics equal to it. Change both together: the table has the same columns in the same order.';

-- 2. mv_customer_metrics becomes a table with the same name, columns and
--    indexes. CASCADE drops customer_aggregates, rebuilt as it was below.
DROP MATERIALIZED VIEW public.mv_customer_metrics CASCADE;

CREATE TABLE public.mv_customer_metrics AS
    SELECT * FROM public.customer_metrics_source WITH NO DATA;
ALTER TABLE public.mv_customer_metrics
    ALTER COLUMN tenant_id SET NOT NULL,
    ALTER COLUMN customer_phone SET NOT NULL;

CREATE UNIQUE INDEX uq_mv_customer_metrics_tenant_phone ON public.mv_customer_metrics USING btree (tenant_id, customer_phone);
CREATE INDEX idx_mv_customer_metrics_tenant_last_order ON public.mv_customer_metrics USING btree (tenant_id, last_order_date DESC);
CREATE INDEX idx_mv_customer_metrics_phone ON public.mv_customer_metrics USING btree (customer_phone);
CREATE INDEX idx_mv_customer_metrics_phone_trgm ON public.mv_customer_metrics USING gin (customer_phone extensions.gin_trgm_ops);
CREATE INDEX idx_mv_customer_metrics_name_folded_trgm ON public.mv_customer_metrics USING gin (public.normalize_arabic_text_for_search(latest_name) extensions.gin_trgm_ops);
CREATE INDEX idx_mv_customer_metrics_city_folded_trgm ON public.mv_customer_metrics USING gin (public.normalize_arabic_text_for_search(latest_city) extensions.gin_trgm_ops);

-- As the materialized view: no API role reads it directly (SEC-D1). The
-- server-side backup reads it with the service role.
ALTER TABLE public.mv_customer_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mv_customer_metrics FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.mv_customer_metrics TO service_role;
COMMENT ON TABLE public.mv_customer_metrics IS
    'Every customer''s numbers, one row per shop and phone. A table since B9 (the mv_ name is historical: the app, the backup and the customer functions read it by name). Only refresh_customer_aggregates writes it, from customer_metrics_source. Clients read customer_aggregates.';

CREATE VIEW public.customer_aggregates AS
 SELECT customer_phone,
    tenant_id,
    latest_name,
    latest_city,
    latest_governorate,
    total_orders,
    total_spent,
    last_order_date,
    first_order_date,
    total_items,
    last_order_id,
    last_order_status,
    latest_secondary_phone,
    latest_address_details,
    completed_count,
    cancelled_count,
    no_response_count,
    rejected_count,
    returned_count,
    refund_count
   FROM public.mv_customer_metrics
  WHERE (tenant_id IN ( SELECT public.get_user_tenant_ids() AS get_user_tenant_ids));

REVOKE ALL ON public.customer_aggregates FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.customer_aggregates TO authenticated;
GRANT ALL ON public.customer_aggregates TO service_role;
COMMENT ON VIEW public.customer_aggregates IS
    'Tenant-scoped read path for mv_customer_metrics. Clients MUST use this view; the table is not granted to anon/authenticated. See SEC-D1 in docs/audits/DASHBOARD_PAGE_SOTA_AUDIT_2026-09-02.md.';

-- 3. The queue of customers to recount. Internal: no API role touches it.
CREATE TABLE public.customer_metrics_dirty (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id uuid,
    phone text,
    order_row_id uuid,
    parent_row_id uuid,
    queued_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.customer_metrics_dirty ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_metrics_dirty FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE public.customer_metrics_dirty IS
    'Orders whose customers refresh_customer_aggregates must recount: the order (orders.id), its phone as it was, and the order it replaced. Filled by triggers on orders and order_status_history, emptied by each run.';

CREATE FUNCTION public.customer_metrics_queue_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
    if tg_op <> 'DELETE' then
        insert into public.customer_metrics_dirty (tenant_id, phone, order_row_id, parent_row_id)
        values (new.tenant_id, new.phone, new.id, new.original_order_id);
    end if;
    -- The customer it belonged to, and the order it replaced, before.
    if tg_op = 'DELETE' then
        insert into public.customer_metrics_dirty (tenant_id, phone, order_row_id, parent_row_id)
        values (old.tenant_id, old.phone, old.id, old.original_order_id);
    elsif tg_op = 'UPDATE' then
        if (old.tenant_id, old.phone, old.original_order_id)
           is distinct from (new.tenant_id, new.phone, new.original_order_id) then
            insert into public.customer_metrics_dirty (tenant_id, phone, order_row_id, parent_row_id)
            values (old.tenant_id, old.phone, old.id, old.original_order_id);
        end if;
    end if;
    return null;
end;
$function$;

-- A delivered step in an order's history makes order_was_delivered true,
-- which the source reads for the order and for its replacements.
CREATE FUNCTION public.customer_metrics_queue_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
    if tg_op <> 'DELETE' then
        insert into public.customer_metrics_dirty (tenant_id, order_row_id)
        values (new.tenant_id, new.order_id);
    end if;
    if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.order_id is distinct from new.order_id) then
        insert into public.customer_metrics_dirty (tenant_id, order_row_id)
        values (old.tenant_id, old.order_id);
    end if;
    return null;
end;
$function$;

REVOKE ALL ON FUNCTION public.customer_metrics_queue_order() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.customer_metrics_queue_status_history() FROM PUBLIC, anon, authenticated, service_role;

-- Every orders column the source reads, for the order itself or as another
-- order's original or replacement.
CREATE TRIGGER customer_metrics_queue_insert
    AFTER INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.customer_metrics_queue_order();
CREATE TRIGGER customer_metrics_queue_update
    AFTER UPDATE ON public.orders
    FOR EACH ROW
    WHEN (old.tenant_id IS DISTINCT FROM new.tenant_id
       OR old.phone IS DISTINCT FROM new.phone
       OR old.status IS DISTINCT FROM new.status
       OR old.deleted_at IS DISTINCT FROM new.deleted_at
       OR old.is_archived IS DISTINCT FROM new.is_archived
       OR old.is_test IS DISTINCT FROM new.is_test
       OR old.is_return IS DISTINCT FROM new.is_return
       OR old.original_order_id IS DISTINCT FROM new.original_order_id
       OR old.order_id IS DISTINCT FROM new.order_id
       OR old.created_at IS DISTINCT FROM new.created_at
       OR old.customer_name IS DISTINCT FROM new.customer_name
       OR old.city IS DISTINCT FROM new.city
       OR old.governorate_code IS DISTINCT FROM new.governorate_code
       OR old.secondary_phone IS DISTINCT FROM new.secondary_phone
       OR old.address_details IS DISTINCT FROM new.address_details
       OR old.price IS DISTINCT FROM new.price
       OR old.items IS DISTINCT FROM new.items
       OR old.refunded_at IS DISTINCT FROM new.refunded_at
       OR old.refund_status IS DISTINCT FROM new.refund_status
       OR old.delivered_at IS DISTINCT FROM new.delivered_at)
    EXECUTE FUNCTION public.customer_metrics_queue_order();
CREATE TRIGGER customer_metrics_queue_delete
    AFTER DELETE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.customer_metrics_queue_order();

CREATE TRIGGER customer_metrics_queue_insert
    AFTER INSERT ON public.order_status_history
    FOR EACH ROW
    WHEN (new.to_status IN ('delivered', 'completed') OR new.from_status IN ('delivered', 'completed'))
    EXECUTE FUNCTION public.customer_metrics_queue_status_history();
CREATE TRIGGER customer_metrics_queue_update
    AFTER UPDATE OF order_id, from_status, to_status ON public.order_status_history
    FOR EACH ROW
    WHEN (old.to_status IN ('delivered', 'completed') OR old.from_status IN ('delivered', 'completed')
       OR new.to_status IN ('delivered', 'completed') OR new.from_status IN ('delivered', 'completed'))
    EXECUTE FUNCTION public.customer_metrics_queue_status_history();
CREATE TRIGGER customer_metrics_queue_delete
    AFTER DELETE ON public.order_status_history
    FOR EACH ROW
    WHEN (old.to_status IN ('delivered', 'completed') OR old.from_status IN ('delivered', 'completed'))
    EXECUTE FUNCTION public.customer_metrics_queue_status_history();

-- 4. One customer's numbers. plpgsql on purpose: a sql function would be
--    inlined into the caller's join, and the shop and phone would no longer
--    reach the orders phone index (a full scan of every order per run).
CREATE FUNCTION public.customer_metrics_for(p_tenant_id uuid, p_phone text)
RETURNS SETOF public.mv_customer_metrics
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
begin
    return query
        select * from public.customer_metrics_source s
        where s.tenant_id = p_tenant_id and s.customer_phone = p_phone;
end;
$function$;

REVOKE ALL ON FUNCTION public.customer_metrics_for(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.refresh_customer_aggregates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
    v_since timestamptz;
begin
    -- One run at a time. A run that finds another still going leaves the
    -- queue for the next one.
    if not pg_try_advisory_xact_lock(hashtext('refresh_customer_aggregates')) then
        return;
    end if;

    select refreshed_at into v_since
    from public.cron_refresh_state
    where job = 'customer_aggregates';

    if v_since is null
       or (select count(*) from (select 1 from public.customer_metrics_dirty limit 20001) q) > 20000 then
        -- Everyone: cheaper than one by one past about 20,000 customers.
        delete from public.customer_metrics_dirty;

        with fresh as (
            select * from public.customer_metrics_source
        ), saved as (
            insert into public.mv_customer_metrics as m
            select * from fresh
            on conflict (tenant_id, customer_phone) do update set
                latest_name = excluded.latest_name,
                latest_city = excluded.latest_city,
                latest_governorate = excluded.latest_governorate,
                total_orders = excluded.total_orders,
                total_spent = excluded.total_spent,
                last_order_date = excluded.last_order_date,
                first_order_date = excluded.first_order_date,
                total_items = excluded.total_items,
                last_order_id = excluded.last_order_id,
                last_order_status = excluded.last_order_status,
                latest_secondary_phone = excluded.latest_secondary_phone,
                latest_address_details = excluded.latest_address_details,
                completed_count = excluded.completed_count,
                cancelled_count = excluded.cancelled_count,
                no_response_count = excluded.no_response_count,
                rejected_count = excluded.rejected_count,
                returned_count = excluded.returned_count,
                refund_count = excluded.refund_count,
                severe_count = excluded.severe_count,
                recent_severe_count = excluded.recent_severe_count,
                moderate_count = excluded.moderate_count,
                recent_moderate_count = excluded.recent_moderate_count
            where m is distinct from excluded
        )
        delete from public.mv_customer_metrics m
        where not exists (
            select 1 from fresh f
            where f.tenant_id = m.tenant_id and f.customer_phone = m.customer_phone
        );
    else
        with taken as (
            delete from public.customer_metrics_dirty
            returning tenant_id, phone, order_row_id, parent_row_id
        ), keys as (
            select distinct k.tenant_id, k.phone
            from (
                -- The order's customer, as queued (before and after a change).
                select t.tenant_id, public.normalize_phone_for_search(t.phone) as phone
                from taken t
                where t.phone is not null
                union all
                -- The order's customer now (a history step queues no phone).
                select o.tenant_id, public.normalize_phone_for_search(o.phone)
                from taken t join public.orders o on o.id = t.order_row_id
                union all
                -- The customer of the order it replaced.
                select o.tenant_id, public.normalize_phone_for_search(o.phone)
                from taken t join public.orders o on o.id = t.parent_row_id
                union all
                -- The customers of its replacements.
                select o.tenant_id, public.normalize_phone_for_search(o.phone)
                from taken t join public.orders o on o.original_order_id = t.order_row_id
                union all
                -- Orders that turned 6 months old since the last run leave the
                -- recent counts. A day of slack covers month-end arithmetic.
                select o.tenant_id, public.normalize_phone_for_search(o.phone)
                from public.orders o
                where o.created_at >= v_since - interval '6 mons' - interval '1 day'
                  and o.created_at < now() - interval '6 mons'
                  and o.phone is not null
            ) k
            where k.tenant_id is not null and k.phone is not null and k.phone <> ''
        ), fresh as (
            select r.*
            from keys k
            cross join lateral public.customer_metrics_for(k.tenant_id, k.phone) r
        ), saved as (
            insert into public.mv_customer_metrics as m
            select * from fresh
            on conflict (tenant_id, customer_phone) do update set
                latest_name = excluded.latest_name,
                latest_city = excluded.latest_city,
                latest_governorate = excluded.latest_governorate,
                total_orders = excluded.total_orders,
                total_spent = excluded.total_spent,
                last_order_date = excluded.last_order_date,
                first_order_date = excluded.first_order_date,
                total_items = excluded.total_items,
                last_order_id = excluded.last_order_id,
                last_order_status = excluded.last_order_status,
                latest_secondary_phone = excluded.latest_secondary_phone,
                latest_address_details = excluded.latest_address_details,
                completed_count = excluded.completed_count,
                cancelled_count = excluded.cancelled_count,
                no_response_count = excluded.no_response_count,
                rejected_count = excluded.rejected_count,
                returned_count = excluded.returned_count,
                refund_count = excluded.refund_count,
                severe_count = excluded.severe_count,
                recent_severe_count = excluded.recent_severe_count,
                moderate_count = excluded.moderate_count,
                recent_moderate_count = excluded.recent_moderate_count
            where m is distinct from excluded
        )
        -- Customers left with no orders that count.
        delete from public.mv_customer_metrics m
        using keys k
        where m.tenant_id = k.tenant_id and m.customer_phone = k.phone
          and not exists (
              select 1 from fresh f
              where f.tenant_id = k.tenant_id and f.customer_phone = k.phone
          );
    end if;

    -- The write count is no longer a gate for this job; it is kept so the
    -- row reads like the other jobs' (orders writes seen at the last run).
    insert into public.cron_refresh_state (job, fingerprint, refreshed_at)
    values ('customer_aggregates', public.orders_write_fingerprint(), now())
    on conflict (job) do update
        set fingerprint = excluded.fingerprint, refreshed_at = excluded.refreshed_at;
end;
$function$;

REVOKE ALL ON FUNCTION public.refresh_customer_aggregates() FROM PUBLIC, anon, authenticated;

-- 5. First fill: everyone (no previous run). The triggers above already
--    queue any order written from here on.
DELETE FROM public.cron_refresh_state WHERE job = 'customer_aggregates';
SELECT public.refresh_customer_aggregates();
