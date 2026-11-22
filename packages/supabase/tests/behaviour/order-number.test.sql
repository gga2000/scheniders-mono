-- Behaviour test for next_order_number, run against the newest definition in
-- packages/supabase/migrations (see run.sh). Every check raises on a wrong
-- result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test (Fermi B9, 20261122184156_order_number_past_999.sql):
--   the first numbers of a day keep three digits: '<digit><YYMMDD>001';
--   a number already held is skipped;
--   numbers 999, 1000 and 12345 of a day come out whole, never cut to three
--   digits, so the 1,000th order of a day gets a number instead of the
--   generator drawing forever (statement_timeout below turns a hang into a
--   failure);
--   each source digit counts on its own.

\set ON_ERROR_STOP 1
SET statement_timeout = '5s';

DO $t$
DECLARE
    _day text := to_char(current_date, 'YYMMDD');
    _got text;
    _i int;
BEGIN
    -- First of the day, three digits.
    _got := public.next_order_number('4');
    IF _got <> '4' || _day || '001' THEN
        RAISE EXCEPTION 'first number of the day: got %, want %', _got, '4' || _day || '001';
    END IF;
    INSERT INTO public.orders (order_id) VALUES (_got);

    -- A held number is skipped.
    INSERT INTO public.orders (order_id) VALUES ('4' || _day || '002');
    _got := public.next_order_number('4');
    IF _got <> '4' || _day || '003' THEN
        RAISE EXCEPTION 'held number not skipped: got %, want %', _got, '4' || _day || '003';
    END IF;
    INSERT INTO public.orders (order_id) VALUES (_got);

    -- Hold every three-digit number of the day, as 999 orders would.
    INSERT INTO public.orders (order_id)
    SELECT '4' || _day || lpad(n::text, 3, '0') FROM generate_series(4, 999) n;
    PERFORM setval('public.order_number_seq_4',
                   (SELECT base FROM public.order_number_days WHERE prefix = '4' || _day) + 998);

    _got := public.next_order_number('4');
    IF _got <> '4' || _day || '1000' THEN
        RAISE EXCEPTION '1,000th number of the day: got %, want %', _got, '4' || _day || '1000';
    END IF;
    INSERT INTO public.orders (order_id) VALUES (_got);

    _got := public.next_order_number('4');
    IF _got <> '4' || _day || '1001' THEN
        RAISE EXCEPTION '1,001st number of the day: got %, want %', _got, '4' || _day || '1001';
    END IF;

    PERFORM setval('public.order_number_seq_4',
                   (SELECT base FROM public.order_number_days WHERE prefix = '4' || _day) + 12344);
    _got := public.next_order_number('4');
    IF _got <> '4' || _day || '12345' THEN
        RAISE EXCEPTION 'number 12345 of the day: got %, want %', _got, '4' || _day || '12345';
    END IF;

    -- Another source digit starts its own day at 001.
    _got := public.next_order_number('1');
    IF _got <> '1' || _day || '001' THEN
        RAISE EXCEPTION 'source 1 first number: got %, want %', _got, '1' || _day || '001';
    END IF;

    -- Every number handed out is distinct.
    FOR _i IN 1..50 LOOP
        INSERT INTO public.orders (order_id) VALUES (public.next_order_number('4'));
    END LOOP;
END;
$t$;
