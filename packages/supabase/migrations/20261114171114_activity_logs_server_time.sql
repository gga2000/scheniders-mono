-- Platform audit round 2 (N2): payroll counts attendance as the days an
-- employee has activity-log rows, and the browser writes those rows. Any
-- signed-in member could send a row with a back-dated created_at and erase
-- their own absences. A row written from the app now always carries the
-- database's own time. Server code (service role) keeps the time it sends.
CREATE OR REPLACE FUNCTION public.activity_logs_stamp_time()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        NEW.created_at := now();
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.activity_logs_stamp_time() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_activity_logs_stamp_time ON public.activity_logs;
CREATE TRIGGER trg_activity_logs_stamp_time
    BEFORE INSERT ON public.activity_logs
    FOR EACH ROW EXECUTE FUNCTION public.activity_logs_stamp_time();
