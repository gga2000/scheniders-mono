-- Fermi B9 (load test, 22 Nov): the 1,000th order number of a source digit
-- on one day never came out. lpad(n::text, 3, '0') CUTS a longer string to 3
-- characters, so from n = 1000 every candidate was a number already held
-- (1000 -> '100', 1001 -> '100', 1234 -> '123', ...) and the loop drew
-- forever: one CPU busy and the shop's create_order_atomic lock held until
-- statement_timeout. The counter is platform-wide per source digit, so the
-- 1,000th order of a day across ALL shops (storefront, manual, abandoned carts
-- all use digit 4) froze every later order that day.
-- Fix: pad to at least three digits, never cut. Numbers 1..999 are unchanged
-- ('<digit><YYMMDD>007'); from 1,000 the counter grows ('<digit><YYMMDD>1000'),
-- which lib/order-number.ts already accepts (/^[1-4]\d{9,}$/).
-- Body otherwise as 20261026142859_order_number_counter.sql.

CREATE OR REPLACE FUNCTION public.next_order_number(_source_code text)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
    _prefix text;
    _seq regclass;
    _v bigint;
    _base bigint;
    _n text;
    _candidate text;
BEGIN
    IF _source_code IS NULL OR _source_code !~ '^[1-4]$' THEN
        RAISE EXCEPTION 'next_order_number: invalid source code %', _source_code USING ERRCODE = '22023';
    END IF;
    _prefix := _source_code || to_char(current_date, 'YYMMDD');
    _seq := format('public.order_number_seq_%s', _source_code)::regclass;

    LOOP
        _v := nextval(_seq);
        SELECT base INTO _base FROM public.order_number_days WHERE prefix = _prefix;
        IF NOT FOUND THEN
            INSERT INTO public.order_number_days (prefix, base) VALUES (_prefix, _v - 1)
            ON CONFLICT (prefix) DO NOTHING;
            SELECT base INTO STRICT _base FROM public.order_number_days WHERE prefix = _prefix;
        END IF;
        -- A concurrent first caller of the day set a base above this value:
        -- draw again (the next value is above every value already drawn).
        CONTINUE WHEN _v - _base < 1;
        -- At least three digits, never fewer, never cut (lpad cuts a longer string).
        _n := (_v - _base)::text;
        _candidate := _prefix || lpad(_n, greatest(3, length(_n)), '0');
        -- Skip a number already held (a passthrough order_id, or a row the
        -- seed did not count). Equality probe on orders_order_id_key.
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.orders WHERE order_id = _candidate);
    END LOOP;

    RETURN _candidate;
END;
$function$;

REVOKE ALL ON FUNCTION public.next_order_number(text) FROM PUBLIC, anon, authenticated, service_role;
