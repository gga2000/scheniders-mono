-- =============================================
-- create_storefront_order: create_order_atomic behind a soft duplicate guard
--
-- Spec: docs/superpowers/specs/2026-10-21-pdp-order-safety-net-design.md §2.
-- The storefront checkout (apps/storefront/app/actions/checkout.ts) calls
-- this instead of create_order_atomic. Holding create_order_atomic's own
-- transaction lock, it:
--   1. sends a repeated idempotency key straight to create_order_atomic, which
--      answers with that key's order (`idempotent_replay`) exactly as before;
--   2. otherwise, when this tenant already has a live, non-test order from the
--      same phone (loyalty_phone_key) placed inside the window that contains
--      EVERY paid product of this one, returns that order with
--      `idempotent_replay` and `duplicate_guard` set — nothing is inserted;
--   3. otherwise runs create_order_atomic(_order_data, _tenant_id), unchanged.
--
-- Race safety: pg_advisory_xact_lock(hashtext('create_order_lock')) is the
-- lock create_order_atomic takes. A transaction-scoped lock is held until
-- this RPC's transaction commits — after the insert. Every other storefront
-- submit and every LF create_order_atomic call waits on the same lock, and
-- (VOLATILE plpgsql, READ COMMITTED) the guard's SELECT takes its snapshot
-- after the lock is granted, so it sees the order the previous holder
-- committed. create_order_atomic re-taking the lock in the same transaction
-- is re-entrant; there is no second lock, so no lock-order deadlock.
--
-- create_order_atomic is NOT modified; LF keeps calling it directly.
-- Service role only. No table or RLS change.
-- =============================================

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

COMMENT ON FUNCTION public.create_storefront_order(jsonb, uuid, uuid[], integer) IS
  'Storefront checkout: create_order_atomic (unchanged) behind a soft duplicate guard — same tenant + loyalty_phone_key + every paid product within the window returns the existing order with idempotent_replay+duplicate_guard. Takes create_order_atomic''s transaction lock first, so the check and the insert are one critical section.';
