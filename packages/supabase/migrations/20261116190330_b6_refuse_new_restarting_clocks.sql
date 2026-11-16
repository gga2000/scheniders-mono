-- Fermi B6 (no fake urgency on stores): no new clock that restarts on its own.
--
-- A store's offer clock must count to the end time the merchant set. The
-- store sections already draw no clock for a midnight reset or a missing
-- date, and the store editor no longer offers the restarting modes
-- ("daily_reset", "evergreen_minutes"). This guard makes the same rule hold
-- for every other way a store's layout is written (the patch call, a full
-- save, a restored version): a write may keep the restarting clocks a
-- layout already holds, but may not add one. On 16 Nov only one store holds
-- any (two loops); every other store and every category page holds none.
--
-- Counted per column, old against new, so publishing a draft into the live
-- layout passes when both already hold the same clocks.

CREATE OR REPLACE FUNCTION public.refuse_new_restarting_clocks()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_new_row jsonb := pg_catalog.to_jsonb(NEW);
    v_old_row jsonb := CASE WHEN TG_OP = 'UPDATE' THEN pg_catalog.to_jsonb(OLD) END;
    v_col text;
    v_new_count integer;
    v_old_count integer;
BEGIN
    FOREACH v_col IN ARRAY TG_ARGV LOOP
        CONTINUE WHEN v_old_row IS NOT NULL
            AND (v_new_row -> v_col) IS NOT DISTINCT FROM (v_old_row -> v_col);
        SELECT pg_catalog.count(*) INTO v_new_count
          FROM pg_catalog.jsonb_path_query(COALESCE(v_new_row -> v_col, '{}'::jsonb),
               'strict $.** ? (@.mode == "daily_reset" || @.mode == "evergreen_minutes")');
        CONTINUE WHEN v_new_count = 0;
        SELECT pg_catalog.count(*) INTO v_old_count
          FROM pg_catalog.jsonb_path_query(COALESCE(v_old_row -> v_col, '{}'::jsonb),
               'strict $.** ? (@.mode == "daily_reset" || @.mode == "evergreen_minutes")');
        IF v_new_count > v_old_count THEN
            RAISE EXCEPTION 'An offer clock must count to the offer''s real end time; a clock that restarts on its own cannot be added (%.%)',
                TG_TABLE_NAME, v_col
                USING ERRCODE = 'check_violation',
                      HINT = 'Set the clock to a fixed end time.';
        END IF;
    END LOOP;
    RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.refuse_new_restarting_clocks() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.refuse_new_restarting_clocks() IS
'Fermi B6: a store layout write may keep the restarting offer clocks (mode daily_reset / evergreen_minutes) it already holds, never add one. Trigger arguments = the jsonb columns to check. Mirrors RESTARTING_COUNTDOWN_MODES in packages/sections/src/helpers/countdown.ts.';

DROP TRIGGER IF EXISTS trg_refuse_new_restarting_clocks ON public.tenants;
CREATE TRIGGER trg_refuse_new_restarting_clocks
    BEFORE INSERT OR UPDATE OF store_config_v2, store_config_v2_draft ON public.tenants
    FOR EACH ROW EXECUTE FUNCTION public.refuse_new_restarting_clocks('store_config_v2', 'store_config_v2_draft');

DROP TRIGGER IF EXISTS trg_refuse_new_restarting_clocks ON public.categories;
CREATE TRIGGER trg_refuse_new_restarting_clocks
    BEFORE INSERT OR UPDATE OF page_config, page_config_draft ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.refuse_new_restarting_clocks('page_config', 'page_config_draft');