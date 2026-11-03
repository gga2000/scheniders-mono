-- Move the 48h "contacted -> no response" rule out of the browser and into the DB.
--
-- Why: the rule ran in every staff member's browser (use-auto-no-response.ts).
-- It judged a copy of the order list kept on that device and wrote the result
-- with the person's login. Two wrong things followed:
--   1. The change was credited to whoever had the page open (the history row
--      takes the signed-in user), so automatic moves showed up in the activity
--      feed, the order card and agent stats under a staff name.
--   2. The write had no status or version guard, so a stale device copy could
--      overwrite a newer status. 2026-11-03 21:03 UTC: noor's browser reopened
--      with a copy that still said #7680 was "contacted"; Ali had cancelled it
--      at 09:51. The write put it back to "no response" under noor's name.
--
-- Now: one guarded UPDATE, run by pg_cron, so it has no signed-in user and
-- the history row and feed entry read "System" / "Automation".
--
-- Guard: the row must STILL be contacted, with a contact time older than the
-- threshold, at the moment of the update. One order that a trigger refuses
-- (exchanged originals) is skipped with a warning and does not block the rest.

CREATE OR REPLACE FUNCTION public.auto_move_to_no_response(p_hours integer DEFAULT 48)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_moved integer := 0;
    r record;
BEGIN
    IF p_hours IS NULL OR p_hours < 1 THEN
        RAISE EXCEPTION 'p_hours must be at least 1';
    END IF;

    FOR r IN
        SELECT o.id, o.order_id
        FROM public.orders o
        WHERE o.status = 'contacted'
          AND o.deleted_at IS NULL
          AND o.tenant_id IS NOT NULL
          AND o.last_contacted_at IS NOT NULL
          AND o.last_contacted_at < now() - make_interval(hours => p_hours)
    LOOP
        BEGIN
            UPDATE public.orders
            SET status = 'no_response',
                last_status_changed_by_name = 'System',
                last_status_changed_by_avatar = NULL
            WHERE id = r.id
              AND status = 'contacted'
              AND last_contacted_at < now() - make_interval(hours => p_hours);

            IF FOUND THEN
                v_moved := v_moved + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'auto_move_to_no_response: order % skipped: %', r.order_id, SQLERRM;
        END;
    END LOOP;

    RETURN v_moved;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_move_to_no_response(integer) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.auto_move_to_no_response(integer) IS
    'Moves orders still in contacted, last contacted more than p_hours ago, to no_response. Runs from pg_cron; the status history and feed credit "System".';

SELECT cron.schedule(
    'auto-no-response',
    '*/10 * * * *',
    $cron$SELECT public.auto_move_to_no_response(48);$cron$
);
