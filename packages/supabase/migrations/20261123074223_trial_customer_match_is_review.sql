-- Fermi B5, Ali 23 Nov: customers shared with an earlier store are a medium
-- sign, no longer a strong one. An earlier store's owner can mark orders
-- delivered by hand, so a customer match alone puts the shop on the staff
-- review list and its trial runs on; the trial ends only when the owner phone
-- or a team email also matches (two medium signs). Shared customers count as
-- one sign however many earlier stores share them. No shop has a trial check
-- yet (23 Nov), so no decision taken under the old rule is left to undo.
CREATE OR REPLACE FUNCTION public.trial_check_run(_tenant_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _status text;
    _created timestamptz;
    _signals jsonb;
    _strong integer;
    _medium integer;
    _overlap jsonb;
    _overlap_stores integer;
    _verdict text;
    _decision text;
BEGIN
    SELECT t.status::text, t.created_at INTO _status, _created
      FROM public.tenants t WHERE t.id = _tenant_id;
    IF NOT FOUND OR public.trial_check_skipped(_tenant_id) THEN
        RETURN NULL;
    END IF;

    -- Every store's identifiers are kept, paying or not: a paying store that
    -- stops paying counts as an earlier store from then on.
    PERFORM public.trial_fingerprints_refresh(_tenant_id);

    IF _status <> 'trial' THEN
        RETURN NULL;
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object('family', h.family, 'source', h.source, 'tenant_id', h.matched)
                              ORDER BY h.family, h.source, h.matched), '[]'::jsonb),
           count(DISTINCT h.digest) FILTER (WHERE h.family = 'prime'),
           count(DISTINCT h.family || ':' || h.digest) FILTER (WHERE h.family IN ('phone', 'email'))
      INTO _signals, _strong, _medium
      FROM (
            SELECT DISTINCT m.family, m.digest, m.source, f.tenant_id AS matched
              FROM public.trial_fingerprints m
              JOIN public.trial_fingerprints f
                ON f.family = m.family AND f.digest = m.digest AND f.tenant_id <> m.tenant_id
              JOIN public.tenants o ON o.id = f.tenant_id
             WHERE m.tenant_id = _tenant_id
               AND o.created_at < _created
               AND NOT public.trial_check_skipped(o.id)
               AND NOT public.tenant_is_paying(o.id)
           ) h;

    -- Customers shared with an earlier store (from 30 delivered orders on):
    -- one medium sign, however many earlier stores share them. Staff see how
    -- many of how many; never which customers.
    SELECT coalesce(jsonb_agg(jsonb_build_object('family', 'customers', 'source', 'customer_overlap',
                                                 'tenant_id', x.tenant_id, 'matched', x.matched,
                                                 'customers', x.customers)
                              ORDER BY x.tenant_id), '[]'::jsonb),
           count(*)
      INTO _overlap, _overlap_stores
      FROM public.trial_customer_overlap(_tenant_id) x
      JOIN public.tenants o ON o.id = x.tenant_id
     WHERE o.created_at < _created
       AND NOT public.trial_check_skipped(o.id)
       AND NOT public.tenant_is_paying(o.id);
    _signals := _signals || _overlap;
    IF _overlap_stores > 0 THEN
        _medium := _medium + 1;
    END IF;

    _verdict := CASE
        WHEN _strong > 0 OR _medium >= 2 THEN 'no_trial'
        WHEN _medium = 1 THEN 'review'
    END;
    IF _verdict IS NULL THEN
        RETURN NULL;
    END IF;

    -- A verdict never goes back down (an earlier store that starts paying
    -- leaves the list of signals, not the decision already taken).
    INSERT INTO public.trial_checks AS c (tenant_id, verdict, signals)
    VALUES (_tenant_id, _verdict, _signals)
    ON CONFLICT (tenant_id) DO UPDATE
       SET verdict = CASE WHEN c.verdict = 'no_trial' THEN 'no_trial' ELSE EXCLUDED.verdict END,
           signals = EXCLUDED.signals,
           updated_at = now()
     WHERE c.signals IS DISTINCT FROM EXCLUDED.signals
        OR (c.verdict = 'review' AND EXCLUDED.verdict = 'no_trial');

    SELECT c.verdict, c.staff_decision INTO _verdict, _decision
      FROM public.trial_checks c WHERE c.tenant_id = _tenant_id;

    IF _verdict = 'no_trial'
       AND _decision IS DISTINCT FROM 'allow_trial'
       AND public.trial_check_end_trial(_tenant_id) THEN
        UPDATE public.trial_checks SET trial_withheld_at = now() WHERE tenant_id = _tenant_id;
        INSERT INTO public.admin_activity_logs (admin_label, tenant_id, action, details)
        VALUES ('system', _tenant_id, 'trial_withheld',
                jsonb_build_object('signals', (SELECT jsonb_agg(DISTINCT s->>'family') FROM jsonb_array_elements(_signals) s)));
    END IF;

    RETURN _verdict;
END;
$function$;
REVOKE ALL ON FUNCTION public.trial_check_run(uuid) FROM PUBLIC, anon, authenticated;