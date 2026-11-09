-- Security round 8: end the transitional grace from 20261108222703.
-- A manager OK must now name its job (sale, payout or tester); the three
-- consumers accept only an OK of their own kind. No NULL-purpose rows exist.

ALTER TABLE public.till_approvals ALTER COLUMN purpose SET NOT NULL;

DO $patch$
DECLARE
    fn record;
    d text;
BEGIN
    FOR fn IN
        SELECT * FROM (VALUES
            ('public.till_approve(uuid,uuid,text,bigint,text)',
             'IF p_purpose IS NOT NULL AND p_purpose NOT IN',
             'IF p_purpose IS NULL OR p_purpose NOT IN'),
            ('public.till_create_sale(uuid,jsonb)',
             'AND (purpose IS NULL OR purpose = ''sale'')',
             'AND purpose = ''sale'''),
            ('public.till_payout(uuid,uuid,bigint,text,uuid)',
             'AND (purpose IS NULL OR purpose = ''payout'')',
             'AND purpose = ''payout'''),
            ('public.till_tester_open(uuid,uuid,uuid,uuid,uuid)',
             'AND (purpose IS NULL OR purpose = ''tester'')',
             'AND purpose = ''tester''')
        ) AS t(sig, old_text, new_text)
    LOOP
        d := pg_get_functiondef(fn.sig::regprocedure);
        IF strpos(d, fn.new_text) > 0 AND strpos(d, fn.old_text) = 0 THEN
            CONTINUE;
        END IF;
        IF strpos(d, fn.old_text) = 0 THEN
            RAISE EXCEPTION '% body changed; update this migration', fn.sig;
        END IF;
        EXECUTE replace(d, fn.old_text, fn.new_text);
    END LOOP;
END;
$patch$;
