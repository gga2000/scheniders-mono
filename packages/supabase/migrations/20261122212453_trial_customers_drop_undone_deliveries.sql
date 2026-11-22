-- Fermi B5, console audit round 23 (data lane new 1, security lane new 1 in
-- part): the one-trial customer list forgets a customer the store no longer
-- delivered to.
--
-- Until now the hourly sweep only added customers: an order recorded as
-- delivered and later moved back (live: 200 moves out of delivered, 127 of
-- them to in transit), or whose phone was rewritten after delivery, left its
-- customer on the store's list for good. A trial could then end on customers
-- the earlier store never delivered to, and one delivered order whose phone
-- is changed every hour added a new "customer" each time.
--
-- Now a counted order that stops counting (moved out of delivered, made a
-- test, practice, return or replacement order, deleted for good) or whose
-- phone or date changes leaves its old phone in trial_customer_left. Each
-- sweep reads those phones again from that store's orders: a customer with no
-- counted order left goes, the rest keep the date of their first one. Only
-- those phones are read, never a whole store. Then every list is read again
-- once, so lists recorded before this change are cleaned too.

-- 1. Phones an order left, waiting for the next sweep.
CREATE TABLE public.trial_customer_left (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tenant_id uuid NOT NULL,
    phone text,
    queued_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trial_customer_left ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.trial_customer_left FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON TABLE public.trial_customer_left IS
    'Fermi B5: the phone (normalized) a counted order had before it stopped counting or its phone or date changed. Filled by triggers on orders, emptied by each trial_customer_sweep, which reads those customers again.';

-- The trigger's WHEN runs as the merchant who changed the order, who may not
-- call trial_counts_order, so it only screens on plain columns (every order
-- trial_counts_order counts is in one of those statuses). The exact test runs
-- here, as the owner.
CREATE FUNCTION public.trial_customer_queue_left()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF NOT public.trial_counts_order(OLD) THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF public.trial_counts_order(NEW)
           AND OLD.phone IS NOT DISTINCT FROM NEW.phone
           AND OLD.tenant_id IS NOT DISTINCT FROM NEW.tenant_id
           AND OLD.created_at IS NOT DISTINCT FROM NEW.created_at THEN
            RETURN NULL;
        END IF;
    END IF;
    INSERT INTO public.trial_customer_left (tenant_id, phone)
    VALUES (OLD.tenant_id, public.normalize_phone(OLD.phone));
    RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.trial_customer_queue_left() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER trial_customer_left_update
    AFTER UPDATE ON public.orders
    FOR EACH ROW
    WHEN (old.status IN ('delivered', 'completed', 'refund_delivered')
          AND (old.status IS DISTINCT FROM new.status
               OR old.phone IS DISTINCT FROM new.phone
               OR old.tenant_id IS DISTINCT FROM new.tenant_id
               OR old.created_at IS DISTINCT FROM new.created_at
               OR old.is_test IS DISTINCT FROM new.is_test
               OR old.guide_practice IS DISTINCT FROM new.guide_practice
               OR old.is_return IS DISTINCT FROM new.is_return
               OR old.is_replacement IS DISTINCT FROM new.is_replacement))
    EXECUTE FUNCTION public.trial_customer_queue_left();
CREATE TRIGGER trial_customer_left_delete
    AFTER DELETE ON public.orders
    FOR EACH ROW
    WHEN (old.status IN ('delivered', 'completed', 'refund_delivered'))
    EXECUTE FUNCTION public.trial_customer_queue_left();

-- 2. A customer's first counted order in one store, or NULL when none is
--    left. Deleted orders still count, so live and deleted orders are read
--    each on their own (tenant_id, phone) index. plpgsql keeps the planner
--    from folding it into the caller and losing those indexes.
CREATE INDEX IF NOT EXISTS idx_orders_tenant_phone_key_deleted
    ON public.orders (tenant_id, public.normalize_phone(phone))
 WHERE deleted_at IS NOT NULL;

CREATE FUNCTION public.trial_customer_first_order(_tenant uuid, _phone text)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    RETURN (
        SELECT min(o.created_at)
          FROM (SELECT x.created_at FROM public.orders x
                 WHERE x.tenant_id = _tenant
                   AND public.normalize_phone(x.phone) = _phone
                   AND x.deleted_at IS NULL
                   AND public.trial_counts_order(x)
                UNION ALL
                SELECT x.created_at FROM public.orders x
                 WHERE x.tenant_id = _tenant
                   AND public.normalize_phone(x.phone) = _phone
                   AND x.deleted_at IS NOT NULL
                   AND public.trial_counts_order(x)) o);
END;
$function$;
REVOKE ALL ON FUNCTION public.trial_customer_first_order(uuid, text) FROM PUBLIC, anon, authenticated, service_role;

-- 3. The sweep: add the customers of changed orders as before, then read the
--    customers an order left again.
CREATE OR REPLACE FUNCTION public.trial_customer_sweep()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _pepper text;
    _from timestamptz;
    _to timestamptz := now();
    _recorded integer;
    _redated integer;
    _removed integer;
    _checked integer := 0;
    _tenant uuid;
BEGIN
    SELECT s.decrypted_secret INTO _pepper
      FROM vault.decrypted_secrets s
     WHERE s.name = 'trial_fingerprint_pepper';
    IF _pepper IS NULL THEN
        RAISE EXCEPTION 'trial_fingerprint_pepper is missing from the vault';
    END IF;

    -- One sweep at a time. A change committed late can carry an updated_at
    -- before the last sweep, so each sweep looks an hour further back.
    SELECT swept_through - interval '1 hour' INTO _from
      FROM public.trial_customer_sweep_state
     WHERE id
       FOR UPDATE;

    -- Store by store, so each read stays on that store's (tenant_id,
    -- updated_at) index instead of reading every order.
    INSERT INTO public.trial_customer_digests AS d (digest, tenant_id, first_order_at)
    SELECT encode(extensions.hmac('customer:' || o.p, _pepper, 'sha256'), 'hex'), t.id, min(o.created_at)
      FROM public.tenants t
     CROSS JOIN LATERAL (
            SELECT x.created_at, public.normalize_phone(x.phone) AS p
              FROM public.orders x
             WHERE x.tenant_id = t.id
               AND x.updated_at >= _from
               AND public.trial_counts_order(x)
           ) o
     WHERE NOT public.trial_check_skipped(t.id)
       AND length(o.p) BETWEEN 10 AND 12
     GROUP BY 1, 2
    ON CONFLICT (digest, tenant_id) DO UPDATE
       SET first_order_at = EXCLUDED.first_order_at
     WHERE EXCLUDED.first_order_at < d.first_order_at;
    GET DIAGNOSTICS _recorded = ROW_COUNT;

    -- Customers an order left: gone when the store has no counted order with
    -- that phone any more, else dated by the first one left. This runs after
    -- the adding above, so a change committed in between is read here, and
    -- one committed later waits in the queue for the next sweep.
    WITH taken AS (
        DELETE FROM public.trial_customer_left RETURNING tenant_id, phone
    ), keys AS (
        SELECT DISTINCT k.tenant_id, k.phone
          FROM taken k
         WHERE length(k.phone) BETWEEN 10 AND 12
    ), now_first AS (
        SELECT k.tenant_id,
               encode(extensions.hmac('customer:' || k.phone, _pepper, 'sha256'), 'hex') AS digest,
               public.trial_customer_first_order(k.tenant_id, k.phone) AS first_order_at
          FROM keys k
    ), dropped AS (
        DELETE FROM public.trial_customer_digests d
         USING now_first n
         WHERE n.first_order_at IS NULL
           AND d.tenant_id = n.tenant_id
           AND d.digest = n.digest
        RETURNING 1
    ), redated AS (
        UPDATE public.trial_customer_digests d
           SET first_order_at = n.first_order_at
          FROM now_first n
         WHERE n.first_order_at IS NOT NULL
           AND d.tenant_id = n.tenant_id
           AND d.digest = n.digest
           AND d.first_order_at IS DISTINCT FROM n.first_order_at
        RETURNING 1
    )
    SELECT (SELECT count(*) FROM dropped), (SELECT count(*) FROM redated)
      INTO _removed, _redated;

    UPDATE public.trial_customer_sweep_state SET swept_through = _to WHERE id;

    FOR _tenant IN
        SELECT t.id
          FROM public.tenants t
         WHERE t.status = 'trial'
           AND NOT public.trial_check_skipped(t.id)
           AND (SELECT count(*) FROM (SELECT 1 FROM public.orders o
                                       WHERE o.tenant_id = t.id AND public.trial_counts_order(o)
                                       LIMIT 30) n) = 30
         ORDER BY t.created_at
    LOOP
        PERFORM public.trial_check_run(_tenant);
        _checked := _checked + 1;
    END LOOP;

    RETURN jsonb_build_object('recorded', _recorded + _redated, 'removed', _removed, 'checked', _checked);
END;
$function$;
REVOKE ALL ON FUNCTION public.trial_customer_sweep() FROM PUBLIC, anon, authenticated;

-- 4. Every list read again once from the delivered orders there are now, so
--    customers kept from orders moved back before this change go too.
DELETE FROM public.trial_customer_digests;
UPDATE public.trial_customer_sweep_state SET swept_through = '-infinity' WHERE id;
SELECT public.trial_customer_sweep();