-- Fermi B5 customer overlap: only delivered orders count (console audit
-- round 22, P2 on 20261122163224).
--
-- Before, every order counted, cancelled and deleted ones included. The phone
-- on an order is typed, unchecked, by whoever places it: a shopper on the
-- storefront, or a merchant on a manual order. So anyone who once opened a
-- store could end a later merchant's free trial with 9 to 30 fake
-- cash-on-delivery orders carrying the old store's customer phones, and the
-- trial store cancelling them changed nothing.
--
-- Now an order counts, on both sides, only once it was delivered (delivered,
-- completed, refund_delivered: the courier handed the parcel over and took the
-- cash). The trial store decides which of its orders it ships, so a fake order
-- would cost a real delivery that a real person pays for. "The first 30
-- orders" are now the first 30 delivered orders. A deleted delivered order
-- still counts, so deleting orders cannot hide a store's customers.
--
-- An order is delivered days after it is placed, so the hourly sweep now reads
-- orders by updated_at (every change sets it: trg_orders_updated_at; index
-- idx_orders_tenant_updated_at) instead of created_at, and starts once more
-- from the beginning. Live had 0 customer digests and 0 overlap signals when
-- this was applied, so no verdict was ever taken on the old rule.
--
-- Rollback: re-run sections 1 and 5 of 20261122163224_trial_customer_overlap.sql.

-- 1. Which orders count: delivered real orders.
CREATE OR REPLACE FUNCTION public.trial_counts_order(_o public.orders)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT _o.status IN ('delivered', 'completed', 'refund_delivered')
       AND NOT coalesce(_o.is_test, false)
       AND NOT _o.guide_practice
       AND NOT coalesce(_o.is_return, false)
       AND NOT coalesce(_o.is_replacement, false);
$function$;
REVOKE ALL ON FUNCTION public.trial_counts_order(public.orders) FROM PUBLIC, anon, authenticated;

-- 2. The hourly sweep reads orders changed since the last sweep (less an hour
--    for late commits), so an order delivered days after it was placed is
--    recorded. first_order_at stays the earliest counted order of that customer.
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

    RETURN jsonb_build_object('recorded', _recorded, 'checked', _checked);
END;
$function$;
REVOKE ALL ON FUNCTION public.trial_customer_sweep() FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.trial_customer_digests IS
    'Fermi B5: keyed hashes of the customer phones of each store''s delivered orders, for the one-trial customer-overlap signal. Never shown to merchants.';
COMMENT ON COLUMN public.trial_checks.signals IS
    'Fermi B5: [{family, source, tenant_id}] per identifier that matched an earlier store; a customers/customer_overlap entry adds matched and customers (how many of the customers of the first 30 delivered orders also had a delivered order there).';

-- 3. Read every store's delivered orders again under the new rule.
DELETE FROM public.trial_customer_digests;
UPDATE public.trial_customer_sweep_state SET swept_through = '-infinity' WHERE id;
SELECT public.trial_customer_sweep();
