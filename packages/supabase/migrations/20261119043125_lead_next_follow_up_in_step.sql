-- A lead's next follow-up is its earliest open follow-up. The staff console
-- set it in a second request after each follow-up write, so when that second
-- request failed, a follow-up that was saved answered "Failed to create
-- follow-up", and staff pressed Schedule again (admin audit round 18,
-- structure new 6). The database now keeps the date in step, in the same
-- transaction as the follow-up write: an insert, a new time, a completion, a
-- move to another lead or a delete.
--
-- Invoker rights: only service_role writes lead_follow_ups (no browser rights
-- since 20261116225533). The lead's own triggers run as before; its score
-- does not read follow-ups, so it is not recounted for a new date.

CREATE OR REPLACE FUNCTION public.lead_follow_ups_set_next()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
    v_lead uuid;
BEGIN
    FOREACH v_lead IN ARRAY ARRAY[
        CASE WHEN TG_OP <> 'INSERT' THEN OLD.lead_id END,
        CASE WHEN TG_OP <> 'DELETE' THEN NEW.lead_id END
    ] LOOP
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

CREATE TRIGGER lead_follow_ups_set_next
AFTER INSERT OR DELETE OR UPDATE OF lead_id, scheduled_at, is_completed ON public.lead_follow_ups
FOR EACH ROW EXECUTE FUNCTION public.lead_follow_ups_set_next();
