-- Status history is written by the database on every status change.
--
-- Before this, only the creation row came from the DB (log_order_creation_history).
-- Every later change relied on the caller inserting its own history row after
-- the status PATCH: the orders page (single + bulk), the Claude tools, and a
-- few RPCs did; the delivery-import "complete" route and the 48h contacted ->
-- no_response sync did not. Measured 2026-11-01: 152 of 607 live orders from
-- the last 60 days had a current status with no matching history row, so the
-- timeline, agent stats and payroll that read this table under-counted.
--
-- 1. log_order_status_change(): AFTER UPDATE OF status on orders, one row per
--    real change, in the same transaction as the change.
-- 2. order_status_history_dedupe(): BEFORE INSERT on order_status_history.
--    Callers that still insert their own row (merge_orders_atomic,
--    process_return, undo_return, and browser tabs running older code) would
--    now write a second row for the same change. Within 15 seconds, an
--    explicit row for the same order and the same from -> to is folded into the
--    trigger's row instead: its notes and a named actor are kept, no duplicate.
--
-- No backfill: for the 152 orders we cannot know when or by whom the missing
-- change happened, and a fabricated audit row is worse than a missing one.

CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_uid   uuid := auth.uid();
    v_actor text;
BEGIN
    IF NEW.tenant_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- The signed-in user wins; then a name the same UPDATE wrote; then System
    -- (service-role routes such as the delivery import, and cron work).
    IF v_uid IS NOT NULL THEN
        SELECT nullif(btrim(up.display_name), '') INTO v_actor
        FROM public.user_profiles up WHERE up.id = v_uid;
        IF v_actor IS NULL THEN
            SELECT u.email INTO v_actor FROM auth.users u WHERE u.id = v_uid;
        END IF;
    END IF;
    IF v_actor IS NULL
       AND NEW.last_status_changed_by_name IS DISTINCT FROM OLD.last_status_changed_by_name THEN
        v_actor := nullif(btrim(NEW.last_status_changed_by_name), '');
    END IF;

    INSERT INTO public.order_status_history (
        order_id, from_status, to_status, changed_by, changed_at, notes, tenant_id
    ) VALUES (
        NEW.id,
        OLD.status,
        NEW.status,
        coalesce(v_actor, 'System'),
        now(),
        CASE WHEN NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
             THEN nullif(btrim(NEW.rejection_reason), '') END,
        NEW.tenant_id
    );

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.log_order_status_change() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_log_order_status_change
AFTER UPDATE OF status ON public.orders
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.log_order_status_change();

CREATE OR REPLACE FUNCTION public.order_status_history_dedupe()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_existing_id uuid;
BEGIN
    -- Creation rows (from_status NULL) are only written by the creation trigger.
    IF NEW.from_status IS NULL THEN
        RETURN NEW;
    END IF;

    SELECT h.id INTO v_existing_id
    FROM public.order_status_history h
    WHERE h.order_id = NEW.order_id
      AND h.from_status = NEW.from_status
      AND h.to_status = NEW.to_status
      AND h.changed_at > now() - interval '15 seconds'
    ORDER BY h.changed_at DESC
    LIMIT 1;

    IF v_existing_id IS NULL THEN
        RETURN NEW;
    END IF;

    UPDATE public.order_status_history h
    SET notes = coalesce(h.notes, nullif(btrim(NEW.notes), '')),
        changed_by = CASE WHEN h.changed_by = 'System' AND nullif(btrim(NEW.changed_by), '') IS NOT NULL
                          THEN NEW.changed_by ELSE h.changed_by END
    WHERE h.id = v_existing_id;

    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.order_status_history_dedupe() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE TRIGGER trg_order_status_history_dedupe
BEFORE INSERT ON public.order_status_history
FOR EACH ROW
EXECUTE FUNCTION public.order_status_history_dedupe();
