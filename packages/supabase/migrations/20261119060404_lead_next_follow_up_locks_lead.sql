-- Two follow-up writes on one lead at the same moment could leave its next
-- follow-up wrong (admin audit round 19, structure new 3). Each write read the
-- lead's open follow-ups first and locked the lead after: a second write that
-- waited on the first kept what it had read before the first committed, and
-- wrote Friday over a Monday call it could not see.
--
-- The trigger now locks the lead before it reads. A second write waits, then
-- reads the follow-ups as committed. NO KEY UPDATE, not UPDATE: each follow-up
-- write takes a KEY SHARE lock on its lead (the foreign key check) just
-- before this trigger, and UPDATE waits on the other writer's: two writers
-- that both passed that check could deadlock.
-- A follow-up moved to another lead locks both leads, in id order.
--
-- Invoker rights, as before: only service_role writes lead_follow_ups.

CREATE OR REPLACE FUNCTION public.lead_follow_ups_set_next()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_leads uuid[] := ARRAY[
        CASE WHEN TG_OP <> 'INSERT' THEN OLD.lead_id END,
        CASE WHEN TG_OP <> 'DELETE' THEN NEW.lead_id END
    ];
    v_lead uuid;
BEGIN
    PERFORM 1 FROM public.leads WHERE id = ANY (v_leads) ORDER BY id FOR NO KEY UPDATE;

    FOREACH v_lead IN ARRAY v_leads LOOP
        CONTINUE WHEN v_lead IS NULL;
        UPDATE public.leads l
           SET next_follow_up_at = n.at
          FROM (
                SELECT min(f.scheduled_at) AS at
                  FROM public.lead_follow_ups f
                 WHERE f.lead_id = v_lead
                   AND NOT f.is_completed
               ) n
         WHERE l.id = v_lead
           AND l.next_follow_up_at IS DISTINCT FROM n.at;
    END LOOP;
    RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.lead_follow_ups_set_next() FROM PUBLIC, anon, authenticated;