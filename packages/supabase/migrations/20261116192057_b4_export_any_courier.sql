-- Fermi B4: "export for shipping" in any courier's format.
--
-- A merchant on any Iraqi courier picks the orders, picks the courier's
-- format (Prime, Al-Waseet, or their own columns), and gets a sheet that
-- uploads into that courier's system. This adds what the file alone cannot
-- hold:
--
--   1. shipping_export_templates: a store's own column layouts ("my courier"),
--      saved once and offered again on the next export.
--   2. shipping_export_log remembers WHICH orders each export carried and the
--      courier's name, so the next export can ask before sending an order twice.
--      company gains 'other' for any courier that is not Prime or Al-Waseet.
--   3. orders.courier_name: the courier a merchant says an order went out with
--      ("sent to <courier>"), set when they confirm the move to in transit
--      after an export. delivery_company stays for the API couriers.
--   4. shipping_export_history: for a set of orders, the last time each one was
--      sent: in an export file (new log, or the older export batches) or to
--      Prime by API.
--   5. mark_orders_sent_with_courier: writes courier_name for orders the
--      merchant moved to in transit.
--
-- Everything is tenant-scoped through RLS; the two functions run as the
-- caller, so they see and change only what the caller already may.

-- orders gets a column: never queue behind a long read and stall the store.
SET lock_timeout = '5s';

-- 1. Saved column layouts ----------------------------------------------------------
CREATE TABLE public.shipping_export_templates (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name         text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
    -- [{ "key": "customer_name", "header": "اسم الزبون" }, ...] in sheet order.
    columns      jsonb NOT NULL CHECK (
                     jsonb_typeof(columns) = 'array'
                     AND jsonb_array_length(columns) BETWEEN 1 AND 30
                 ),
    phone_format text NOT NULL DEFAULT 'local' CHECK (phone_format IN ('local', 'bare', 'intl', 'intl_plus')),
    file_format  text NOT NULL DEFAULT 'xlsx' CHECK (file_format IN ('xlsx', 'csv')),
    created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- One layout per name in a store; saving under the same name updates it.
CREATE UNIQUE INDEX shipping_export_templates_tenant_name
    ON public.shipping_export_templates (tenant_id, lower(btrim(name)));
CREATE INDEX idx_shipping_export_templates_created_by_fk
    ON public.shipping_export_templates (created_by);

ALTER TABLE public.shipping_export_templates ENABLE ROW LEVEL SECURITY;

-- Every member of the store may use a layout; whoever may edit orders may
-- save, change or remove one.
CREATE POLICY shipping_export_templates_member_read ON public.shipping_export_templates
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT public.get_user_tenant_ids()));
CREATE POLICY shipping_export_templates_editor_insert ON public.shipping_export_templates
    FOR INSERT TO authenticated
    WITH CHECK (public.has_tenant_permission(tenant_id, 'orders.edit'));
CREATE POLICY shipping_export_templates_editor_update ON public.shipping_export_templates
    FOR UPDATE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'orders.edit'))
    WITH CHECK (public.has_tenant_permission(tenant_id, 'orders.edit'));
CREATE POLICY shipping_export_templates_editor_delete ON public.shipping_export_templates
    FOR DELETE TO authenticated
    USING (public.has_tenant_permission(tenant_id, 'orders.edit'));

REVOKE ALL ON TABLE public.shipping_export_templates FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.shipping_export_templates TO authenticated;
GRANT ALL ON TABLE public.shipping_export_templates TO service_role;

CREATE OR REPLACE FUNCTION public.shipping_export_templates_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    -- A layout never moves to another store, and keeps who first made it.
    NEW.tenant_id := OLD.tenant_id;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.shipping_export_templates_touch() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_shipping_export_templates_touch
    BEFORE UPDATE ON public.shipping_export_templates
    FOR EACH ROW EXECUTE FUNCTION public.shipping_export_templates_touch();

COMMENT ON TABLE public.shipping_export_templates IS
'Fermi B4: a store''s own courier sheet layout (which columns, their headers, in which order, phone format, xlsx or csv). The orders page export offers them next to Prime and Al-Waseet. Column keys are listed in apps/platform/lib/shipping/export-columns.ts.';

-- 2. The log remembers the orders and the courier ------------------------------------
ALTER TABLE public.shipping_export_log
    ADD COLUMN order_ids uuid[],
    ADD COLUMN courier_name text CHECK (courier_name IS NULL OR char_length(btrim(courier_name)) BETWEEN 1 AND 60);

ALTER TABLE public.shipping_export_log DROP CONSTRAINT shipping_export_log_company_check;
ALTER TABLE public.shipping_export_log
    ADD CONSTRAINT shipping_export_log_company_check CHECK (company IN ('prime', 'waseet', 'other'));

COMMENT ON COLUMN public.shipping_export_log.order_ids IS
'The orders this export carried (Fermi B4). Read by shipping_export_history so the next export asks before sending an order twice. NULL on rows from before B4.';
COMMENT ON COLUMN public.shipping_export_log.courier_name IS
'The courier''s name for an export in the merchant''s own layout (company = other). NULL for Prime and Al-Waseet.';

-- The new signature adds two optional inputs. Drop the old one first so the
-- API never has two candidates for the same named call.
DROP FUNCTION public.log_shipping_export(uuid, text, integer, boolean, text, text);

CREATE FUNCTION public.log_shipping_export(
    p_tenant_id uuid,
    p_company text,
    p_order_count integer,
    p_succeeded boolean,
    p_failure_stage text DEFAULT NULL::text,
    p_error_message text DEFAULT NULL::text,
    p_order_ids uuid[] DEFAULT NULL::uuid[],
    p_courier_name text DEFAULT NULL::text
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF auth.role() = 'service_role' THEN
    RAISE EXCEPTION 'log_shipping_export records what a signed-in operator did; call it as that operator';
  END IF;

  IF p_tenant_id IS NULL OR p_tenant_id NOT IN (SELECT get_user_tenant_ids()) THEN
    RAISE EXCEPTION 'not a member of tenant %', p_tenant_id;
  END IF;

  IF public.tenant_is_demo(p_tenant_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.shipping_export_log (
    tenant_id, exported_by, company, order_count, succeeded, failure_stage, error_message,
    order_ids, courier_name
  ) VALUES (
    p_tenant_id, auth.uid(), p_company, p_order_count, p_succeeded, p_failure_stage,
    -- A provider message can be long and is not worth storing in full.
    left(p_error_message, 500),
    -- Only orders of this store are remembered, so the history never names
    -- another store's order.
    (SELECT array_agg(DISTINCT o.id)
       FROM public.orders o
      WHERE o.tenant_id = p_tenant_id AND o.id = ANY (p_order_ids)),
    nullif(left(btrim(p_courier_name), 60), '')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_shipping_export(uuid, text, integer, boolean, text, text, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_shipping_export(uuid, text, integer, boolean, text, text, uuid[], text) TO authenticated, service_role;

-- 3. "Sent to <courier>" on the order -------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN courier_name text CHECK (courier_name IS NULL OR char_length(btrim(courier_name)) BETWEEN 1 AND 60);
-- The browser reads orders column by column; this one is the merchant's own note.
GRANT SELECT (courier_name) ON public.orders TO authenticated;

COMMENT ON COLUMN public.orders.courier_name IS
'The courier the merchant handed this order to through an export file (Fermi B4), by name. Set when they confirm the move to in transit after an export. API couriers keep using delivery_company.';

-- 4. When was each order last sent -----------------------------------------------------
CREATE FUNCTION public.shipping_export_history(p_tenant_id uuid, p_order_ids uuid[])
RETURNS TABLE (order_id uuid, sent_at timestamptz, courier text)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    WITH hits AS (
        -- Exports since B4 remember their orders.
        SELECT o.id AS order_id, l.created_at AS sent_at,
               coalesce(l.courier_name,
                        CASE l.company WHEN 'prime' THEN 'Prime' WHEN 'waseet' THEN 'Al-Waseet' END) AS courier
          FROM public.shipping_export_log l
         CROSS JOIN LATERAL unnest(l.order_ids) AS o(id)
         WHERE l.tenant_id = p_tenant_id
           AND l.succeeded
           AND l.order_ids OPERATOR(pg_catalog.&&) p_order_ids
           AND o.id = ANY (p_order_ids)
        UNION ALL
        -- Older Prime and Al-Waseet exports are their export batches.
        SELECT o.id::uuid, b.created_at,
               CASE b.invoice_template WHEN 'prime' THEN 'Prime' ELSE 'Al-Waseet' END
          FROM public.print_batches b
         CROSS JOIN LATERAL unnest(b.order_ids) AS o(id)
         WHERE b.tenant_id = p_tenant_id
           AND b.invoice_template IN ('prime', 'waseet')
           AND b.print_type IN ('invoice', 'invoices')
           AND b.order_ids OPERATOR(pg_catalog.&&) (p_order_ids::text[])
           AND o.id = ANY (p_order_ids::text[])
        UNION ALL
        -- Sent to Prime by API and not cancelled there.
        SELECT s.order_id, coalesce(s.sent_at, s.pushed_at), 'Prime'
          FROM public.prime_shipments s
         WHERE s.tenant_id = p_tenant_id
           AND s.order_id = ANY (p_order_ids)
           AND s.cancelled_at IS NULL
    )
    SELECT DISTINCT ON (h.order_id) h.order_id, h.sent_at, h.courier
      FROM hits h
     ORDER BY h.order_id, h.sent_at DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION public.shipping_export_history(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shipping_export_history(uuid, uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.shipping_export_history(uuid, uuid[]) IS
'Fermi B4: for the given orders of a store, the last time each was sent to a courier (an export file since B4, an older Prime/Al-Waseet export batch, or Prime by API) and to which courier. Runs as the caller, so RLS keeps it to the caller''s own stores. The export dialog asks before sending these again.';

-- 5. Mark orders as with a courier -----------------------------------------------------
CREATE FUNCTION public.mark_orders_sent_with_courier(p_tenant_id uuid, p_order_ids uuid[], p_courier_name text)
RETURNS integer
LANGUAGE sql
SET search_path = ''
AS $$
    WITH changed AS (
        UPDATE public.orders o
           SET courier_name = nullif(left(btrim(p_courier_name), 60), '')
         WHERE o.tenant_id = p_tenant_id
           AND o.id = ANY (p_order_ids)
           AND o.deleted_at IS NULL
           AND o.courier_name IS DISTINCT FROM nullif(left(btrim(p_courier_name), 60), '')
        RETURNING 1
    )
    SELECT count(*)::integer FROM changed;
$$;

REVOKE ALL ON FUNCTION public.mark_orders_sent_with_courier(uuid, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_orders_sent_with_courier(uuid, uuid[], text) TO authenticated, service_role;

COMMENT ON FUNCTION public.mark_orders_sent_with_courier(uuid, uuid[], text) IS
'Fermi B4: records which courier the merchant handed these orders to ("sent to <courier>"); an empty name clears it (undo). Runs as the caller: RLS and the orders write guards decide what may change. Returns how many orders changed.';