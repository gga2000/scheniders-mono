DO $$
DECLARE
    r RECORD;
BEGIN
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);

    FOR r IN SELECT id FROM public.leads LOOP
        PERFORM public.calculate_lead_score(r.id);
    END LOOP;
END $$;;
