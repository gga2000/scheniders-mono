-- whatsapp_logs and order_status_history rows written without a tenant_id.
--
-- Who wrote them (live data, grouped by payload source / history notes):
--   whatsapp_logs (548):
--     * 189 inbound customer replies (2026-09-11..10-14) from the Interakt
--       inbound webhooks, which logged the reply without tenant_id
--     * 198 automatic confirmation sends (payload.source dispatch-event /
--       dispatch-event-secondary, 2026-06-19..09-10) from
--       lib/whatsapp-dispatcher.ts before it started stamping tenant_id
--     * 161 manual sends from /api/webhooks/interakt/send (cod_order_confirm,
--       order_reminder, order_discount_offer, failed attempts)
--   order_status_history (424, all changed_by = 'whatsapp_bot', new or
--   pending_checkout -> contacted):
--     * 355 'تم إرسال قالب التأكيد عبر واتساب تلقائياً' from
--       lib/whatsapp-dispatcher.ts (still writing them up to 2026-10-14)
--     * 69 'تم إرسال قالب التأكيد/التذكير عبر واتساب' from
--       /api/webhooks/interakt/send
--     The legacy /api/webhooks/interakt route wrote none of them.
-- The app-side stamping of tenant_id on these writers (dispatcher, send route,
-- both Interakt webhooks, whatsapp-error-handler, waseet submit-orders) is in
-- PR #172. This migration does not depend on it: the triggers below fill the
-- tenant from the order on their own.
--
-- The tenant RLS policies on both tables only match `tenant_id IN
-- (get_user_tenant_ids())`, and a NULL never matches. So the merchant could not
-- see these rows at all: 548 WhatsApp log rows and 424 `whatsapp_bot` status
-- changes, all belonging to one tenant (b5c4f2d4-...). They also dropped out of
-- every per-tenant count built on these tables.
--
-- No row had a tenant that differed from its order's tenant. The only problem
-- was the NULLs.
--
-- What decides the tenant:
--   * The order the row points at (whatsapp_logs.order_uuid,
--     order_status_history.order_id). An order belongs to exactly one tenant, so
--     there is nothing to guess.
--   * For whatsapp_logs rows whose order has since been deleted: another log
--     row for the same order_uuid that recorded a tenant, but only when every
--     such row agrees on one tenant. This resolves 2 rows. The other 13 point at
--     deleted orders with no surviving tenant evidence. A matching phone number
--     is not evidence (phones repeat across tenants), so those 13 stay NULL.
--
-- The triggers below make the invariant hold for every write path, current or
-- future, whether or not it passes tenant_id: tenant_id is filled
-- from the order when it is missing, and a row whose tenant_id disagrees with
-- its order is rejected.
--
-- Neither table has an UPDATE trigger (order_status_history's only trigger is
-- AFTER INSERT), so the backfill below fires nothing else.

-- 1. Backfill ---------------------------------------------------------------

UPDATE public.whatsapp_logs l
SET tenant_id = o.tenant_id
FROM public.orders o
WHERE o.id = l.order_uuid
  AND l.tenant_id IS NULL;

UPDATE public.whatsapp_logs l
SET tenant_id = sib.tenant_id
FROM (
    SELECT s.order_uuid, MIN(s.tenant_id::text)::uuid AS tenant_id
    FROM public.whatsapp_logs s
    WHERE s.order_uuid IS NOT NULL
      AND s.tenant_id IS NOT NULL
    GROUP BY s.order_uuid
    HAVING COUNT(DISTINCT s.tenant_id) = 1
) sib
WHERE sib.order_uuid = l.order_uuid
  AND l.tenant_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = l.order_uuid);

UPDATE public.order_status_history h
SET tenant_id = o.tenant_id
FROM public.orders o
WHERE o.id = h.order_id
  AND h.tenant_id IS NULL;

-- 2. Guard: tenant_id follows the order ------------------------------------

-- SECURITY DEFINER so the order lookup is not narrowed by the caller's RLS. An
-- authenticated insert still has to pass the table's WITH CHECK policy on the
-- tenant this sets, so a caller cannot use another tenant's order_uuid to put a
-- row in that tenant.
CREATE OR REPLACE FUNCTION public.whatsapp_logs_tenant_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_order_tenant uuid;
BEGIN
    IF NEW.order_uuid IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT o.tenant_id INTO v_order_tenant
    FROM public.orders o
    WHERE o.id = NEW.order_uuid;

    IF v_order_tenant IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := v_order_tenant;
    ELSIF NEW.tenant_id <> v_order_tenant THEN
        RAISE EXCEPTION 'whatsapp_logs.tenant_id % does not match order % tenant %',
            NEW.tenant_id, NEW.order_uuid, v_order_tenant
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.whatsapp_logs_tenant_from_order() FROM PUBLIC;

DROP TRIGGER IF EXISTS whatsapp_logs_tenant_from_order ON public.whatsapp_logs;
CREATE TRIGGER whatsapp_logs_tenant_from_order
    BEFORE INSERT OR UPDATE OF order_uuid, tenant_id ON public.whatsapp_logs
    FOR EACH ROW EXECUTE FUNCTION public.whatsapp_logs_tenant_from_order();

CREATE OR REPLACE FUNCTION public.order_status_history_tenant_from_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_order_tenant uuid;
BEGIN
    SELECT o.tenant_id INTO v_order_tenant
    FROM public.orders o
    WHERE o.id = NEW.order_id;

    IF v_order_tenant IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.tenant_id IS NULL THEN
        NEW.tenant_id := v_order_tenant;
    ELSIF NEW.tenant_id <> v_order_tenant THEN
        RAISE EXCEPTION 'order_status_history.tenant_id % does not match order % tenant %',
            NEW.tenant_id, NEW.order_id, v_order_tenant
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.order_status_history_tenant_from_order() FROM PUBLIC;

DROP TRIGGER IF EXISTS order_status_history_tenant_from_order ON public.order_status_history;
CREATE TRIGGER order_status_history_tenant_from_order
    BEFORE INSERT OR UPDATE OF order_id, tenant_id ON public.order_status_history
    FOR EACH ROW EXECUTE FUNCTION public.order_status_history_tenant_from_order();
