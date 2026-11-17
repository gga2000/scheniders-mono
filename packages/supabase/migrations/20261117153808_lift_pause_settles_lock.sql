-- A pause that lifts brings the shop straight back to the lock check (staff
-- console audit, round 12, should-fix 1; agreed with the Fermi thread 17 Nov).
--
-- The money rule stays as it is: a paused shop is not charged while the pause
-- runs, and is charged, or stays locked, once it lifts. Until now the charge
-- waited for the hourly lock check at :17 (platform /api/cron/billing-lock),
-- so a locked shop whose wallet already held the month stayed locked up to an
-- hour after its pause ended (the :21 job), or after staff pressed "Lift the
-- pause now".
--
-- 1. lift_pause_and_settle(id): lifts the pause (lift_tenant_pause gives the
--    shop back its status) and, in the same transaction, settles the lock as a
--    wallet credit does (settle_billing_lock, never waiting: a shop another
--    payment holds answers busy and the :17 check is the backstop). It answers
--    the shop as it stands after both, so a trial that paid reads active. A
--    shop that is not paused answers no row and nothing is settled.
-- 2. lift_ended_pauses() lifts each ended pause through it, one shop at a
--    time: a shop whose lift or settle fails keeps its pause (its own changes
--    are undone, with a warning in the database log) and is tried again at the
--    next run, while the other shops are still lifted.
-- The console's "Lift the pause now" calls lift_pause_and_settle too. The
-- platform's own lift of an ended pause (lib/restrictions.ts) still calls
-- lift_tenant_pause, and the :17 check settles that shop.

-- 1. -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lift_pause_and_settle(_tenant_id uuid)
RETURNS TABLE(id uuid, status public.tenant_status, restrictions jsonb)
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
BEGIN
    PERFORM 1 FROM public.lift_tenant_pause(_tenant_id);
    IF NOT FOUND THEN
        RETURN;
    END IF;

    PERFORM public.settle_billing_lock(_tenant_id, false);

    RETURN QUERY
        SELECT t.id, t.status, t.restrictions FROM public.tenants t WHERE t.id = _tenant_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.lift_pause_and_settle(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lift_pause_and_settle(uuid) TO service_role;

COMMENT ON FUNCTION public.lift_pause_and_settle(uuid) IS
    'Lifts a staff pause (lift_tenant_pause) and settles the billing lock in the same transaction (settle_billing_lock, never waiting). Answers the shop after both, or no row when it was not paused. Service role only.';

-- 2. -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lift_ended_pauses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    _shop record;
    _back record;
    _lifted integer := 0;
BEGIN
    FOR _shop IN
        SELECT t.id, t.restrictions ->> 'paused_until' AS paused_until
          FROM public.tenants t
         WHERE t.status = 'limited'
           AND CASE WHEN pg_input_is_valid(t.restrictions ->> 'paused_until', 'timestamptz')
                    THEN (t.restrictions ->> 'paused_until')::timestamptz <= now()
                    ELSE false END
         ORDER BY t.id
           FOR UPDATE OF t SKIP LOCKED
    LOOP
        -- One shop at a time: a failure undoes only this shop's lift and
        -- settle, and the shop is tried again at the next run.
        BEGIN
            SELECT * INTO _back FROM public.lift_pause_and_settle(_shop.id);
            IF FOUND THEN
                INSERT INTO public.admin_activity_logs (admin_user_id, actor_email, admin_label, tenant_id, action, details)
                VALUES (NULL, NULL, 'system', _shop.id, 'unpause_tenant',
                        jsonb_build_object('status', _back.status, 'ended', true, 'paused_until', _shop.paused_until));
                _lifted := _lifted + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'lift_ended_pauses: shop % stays paused until the next run: %', _shop.id, SQLERRM;
        END;
    END LOOP;
    RETURN _lifted;
END;
$function$;
REVOKE ALL ON FUNCTION public.lift_ended_pauses() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lift_ended_pauses() TO service_role;

COMMENT ON FUNCTION public.lift_ended_pauses() IS
    'Lifts every staff pause whose paused_until has passed and settles its billing lock at once (lift_pause_and_settle), one shop at a time, with one system unpause_tenant log row each. A shop that fails keeps its pause until the next run. Hourly by pg_cron (lift-ended-pauses). Service role only.';