-- ────────────────────────────────────────────────
-- Recompute lead scores after the corrected order-prediction formula.
--
-- The prior migration (20260606141500) fixed estimated_daily_orders but had to
-- run its backfill with the score trigger disabled: calculate_lead_score guards
-- on the JWT role claim (auth.role()), which defaults to 'anon' in a raw
-- migration and is rejected. So existing leads kept a stale "orders" score
-- bucket derived from the OLD prediction.
--
-- Fix: set a system role claim for this transaction so the guard passes, then
-- rescore every lead. Idempotent — safe to re-run; a fresh DB with no leads is
-- a no-op.
-- ────────────────────────────────────────────────

DO $$
DECLARE
    r RECORD;
BEGIN
    -- calculate_lead_score reads auth.role(); make it a system role here.
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

    FOR r IN SELECT id FROM public.leads LOOP
        PERFORM public.calculate_lead_score(r.id);
    END LOOP;
END $$;
