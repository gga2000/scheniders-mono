-- Behaviour test for public.signup_phone_code_check (Fermi B11), run against
-- its newest definition in packages/supabase/migrations (see run.sh).
--
-- Rules under test: a code is checked against the newest unused code sent to
-- that phone; five wrong tries lock it; an expired code never passes; the
-- right code returns the row id as the proof and can be checked again; a code
-- a signup used is never offered again; nobody but the server reaches the
-- table or the function.

\set ON_ERROR_STOP 1

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;

CREATE FUNCTION pg_temp.h(p text) RETURNS text LANGUAGE sql AS $$ SELECT repeat(p, 64) $$;

CREATE FUNCTION pg_temp.try(p_phone text, p_hash text) RETURNS text LANGUAGE sql AS $$
    SELECT result || coalesce(':' || proof::text, '') FROM public.signup_phone_code_check(p_phone, p_hash)
$$;

-- Nothing sent yet.
SELECT pg_temp.check(pg_temp.try('07701234567', pg_temp.h('a')) = 'expired', 'no code sent reads as expired');

-- A code, then five wrong tries.
INSERT INTO public.signup_phone_codes (id, phone, code_hash, expires_at)
VALUES ('c0000000-0000-4000-8000-000000000001', '07701234567', pg_temp.h('a'), now() + interval '10 minutes');
SELECT pg_temp.check(pg_temp.try('07701234567', pg_temp.h('b')) = 'wrong', 'wrong 1');
SELECT pg_temp.check(pg_temp.try('07701234567', pg_temp.h('b')) = 'wrong', 'wrong 2');
SELECT pg_temp.check(pg_temp.try('07701234567', pg_temp.h('b')) = 'wrong', 'wrong 3');
SELECT pg_temp.check(pg_temp.try('07701234567', pg_temp.h('b')) = 'wrong', 'wrong 4');
SELECT pg_temp.check(pg_temp.try('07701234567', pg_temp.h('b')) = 'locked', 'the fifth wrong try locks');
SELECT pg_temp.check(pg_temp.try('07701234567', pg_temp.h('a')) = 'locked', 'the right code no longer passes once locked');
SELECT pg_temp.check((SELECT attempts = 5 AND verified_at IS NULL FROM public.signup_phone_codes WHERE id = 'c0000000-0000-4000-8000-000000000001'), 'five tries counted, not verified');

-- A new code replaces it.
INSERT INTO public.signup_phone_codes (id, phone, code_hash, expires_at, created_at)
VALUES ('c0000000-0000-4000-8000-000000000002', '07701234567', pg_temp.h('c'), now() + interval '10 minutes', now() + interval '1 second');
SELECT pg_temp.check(pg_temp.try('07701234567', pg_temp.h('a')) = 'wrong', 'the old code does not pass for the new one');
SELECT pg_temp.check(pg_temp.try('07701234567', pg_temp.h('c')) = 'ok:c0000000-0000-4000-8000-000000000002', 'the right code returns its proof');
SELECT pg_temp.check((SELECT verified_at IS NOT NULL FROM public.signup_phone_codes WHERE id = 'c0000000-0000-4000-8000-000000000002'), 'marked verified');
SELECT pg_temp.check(pg_temp.try('07701234567', pg_temp.h('c')) = 'ok:c0000000-0000-4000-8000-000000000002', 'checking the right code again gives the same proof');
SELECT pg_temp.check(pg_temp.try('07701234567', pg_temp.h('d')) = 'wrong', 'a wrong code after verifying is still wrong');
SELECT pg_temp.check((SELECT attempts = 1 FROM public.signup_phone_codes WHERE id = 'c0000000-0000-4000-8000-000000000002'), 'only the wrong try before verifying counted');

-- A signup used it: never offered again.
UPDATE public.signup_phone_codes SET used_at = now() WHERE id = 'c0000000-0000-4000-8000-000000000002';
SELECT pg_temp.check(pg_temp.try('07701234567', pg_temp.h('c')) = 'locked', 'a used code falls back to the older locked one, never its own proof');

-- An expired code never passes, and another phone's code is not this one's.
INSERT INTO public.signup_phone_codes (phone, code_hash, expires_at)
VALUES ('07801112222', pg_temp.h('e'), now() - interval '1 second');
SELECT pg_temp.check(pg_temp.try('07801112222', pg_temp.h('e')) = 'expired', 'an expired code never passes');
SELECT pg_temp.check(pg_temp.try('07901112222', pg_temp.h('e')) = 'expired', 'another phone has no code');

-- The table refuses what is not an Iraqi mobile or a hash, and a use before a check.
DO $$
BEGIN
    BEGIN
        INSERT INTO public.signup_phone_codes (phone, code_hash, expires_at) VALUES ('0770123', repeat('a', 64), now());
        RAISE EXCEPTION 'FAIL a short phone was stored';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.signup_phone_codes (phone, code_hash, expires_at) VALUES ('07701234567', '123456', now());
        RAISE EXCEPTION 'FAIL a plain code was stored';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        INSERT INTO public.signup_phone_codes (phone, code_hash, expires_at, used_at) VALUES ('07701234567', repeat('a', 64), now(), now());
        RAISE EXCEPTION 'FAIL a code was used before it was checked';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END $$;

-- Only the server.
SELECT pg_temp.check(NOT has_function_privilege('anon', 'public.signup_phone_code_check(text, text)', 'EXECUTE'), 'anon cannot check codes');
SELECT pg_temp.check(NOT has_function_privilege('authenticated', 'public.signup_phone_code_check(text, text)', 'EXECUTE'), 'signed-in users cannot check codes');
SELECT pg_temp.check(has_function_privilege('service_role', 'public.signup_phone_code_check(text, text)', 'EXECUTE'), 'the server can');
SELECT pg_temp.check(NOT has_table_privilege('anon', 'public.signup_phone_codes', 'SELECT'), 'anon cannot read codes');
SELECT pg_temp.check(NOT has_table_privilege('authenticated', 'public.signup_phone_codes', 'SELECT'), 'signed-in users cannot read codes');
SELECT pg_temp.check(NOT has_table_privilege('authenticated', 'public.signup_phone_codes', 'INSERT'), 'signed-in users cannot add codes');
SELECT pg_temp.check((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.signup_phone_codes'::regclass), 'RLS is on');
SELECT pg_temp.check((SELECT prosecdef FROM pg_proc WHERE oid = 'public.signup_phone_code_check(text, text)'::regprocedure), 'the check runs as definer');

\echo ALL ASSERTIONS PASSED
