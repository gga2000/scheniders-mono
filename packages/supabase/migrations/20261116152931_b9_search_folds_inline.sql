-- Fermi B9 (slow database queries), part 2e: orders search folds text inline.
--
-- Orders search (search_orders_v2) took ~185 ms for a name and ~80 ms for a
-- phone or number on the biggest store (5,600 orders). It folds every order's
-- name, city, address, notes and both phones through
-- normalize_arabic_text_for_search / normalize_phone_for_search: up to six
-- calls per order. Each call cost ~6-8 us, nearly all of it overhead: their
-- SET search_path clause stops Postgres pasting the one-line formula into the
-- calling query, so every call set up and ran a small query of its own.
--
-- The two formulas now live in plain SQL functions, search_fold_arabic and
-- search_fold_phone: no SET clause, and every name inside schema-qualified
-- (pg_catalog.*, OPERATOR(pg_catalog.||)), so Postgres pastes them into the
-- calling query and no caller's search path can change what they do. Supabase
-- lint 0011 (function_search_path_mutable) lists these two; that is accepted
-- on purpose and noted on each. search_orders_v2 now calls them directly.
--
-- normalize_arabic_text_for_search and normalize_phone_for_search keep their
-- names, SET clause and outputs, and now just call the fold functions, so each
-- formula is written once. They stay non-inlinable on purpose: seven
-- expression indexes (orders phones and name, mv_customer_metrics name and
-- city) are built on them, and a connection that has already read an index
-- keeps matching it by the call it read; had the call become inlinable, such
-- connections (some live for days) would stop finding those indexes.
--
-- Same answer: on live, fold and wrapper gave the old output for every
-- distinct name, city, address, note and phone in orders and
-- mv_customer_metrics plus both shared fixtures, and search_orders_v2 returned
-- the same orders in the same order: name ~185 -> ~80 ms, phone or number
-- ~80 -> ~36 ms. Every index on the wrappers is still used.

-- 1. The formulas, inlinable ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_fold_arabic(_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.lower(pg_catalog.btrim(
        pg_catalog.translate(
            pg_catalog.regexp_replace(
                pg_catalog.regexp_replace(_text,
                    '[' OPERATOR(pg_catalog.||) pg_catalog.chr(1611) OPERATOR(pg_catalog.||) '-'
                        OPERATOR(pg_catalog.||) pg_catalog.chr(1631) OPERATOR(pg_catalog.||) pg_catalog.chr(1600)
                        OPERATOR(pg_catalog.||) ']',
                    '', 'g'),
                pg_catalog.chr(1648), '', 'g'),
            'آأإٱةىیکەۀ',
            'ااااهييكهه'
        )
    ));
$function$;

COMMENT ON FUNCTION public.search_fold_arabic(text) IS
'The Arabic search folding formula, written once. Mirrors normalizeArabicText in lib/order-filter-utils.ts (the SEARCH variant, not the address-validator one); pinned to lib/__fixtures__/arabic-normalization.json. No SET search_path on purpose, so Postgres inlines it into per-row queries (orders search); every name inside is schema-qualified, so the caller''s search_path cannot change it. Supabase lint 0011 is accepted for this function (Fermi B9 part 2e). normalize_arabic_text_for_search wraps it for indexes.';

CREATE OR REPLACE FUNCTION public.search_fold_phone(_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
AS $function$
    SELECT pg_catalog.regexp_replace(
             pg_catalog.regexp_replace(
               pg_catalog.regexp_replace(
                 pg_catalog.regexp_replace(pg_catalog.translate(_phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g'),
               '^00', ''),
             '^964', ''),
           '^0', '');
$function$;

COMMENT ON FUNCTION public.search_fold_phone(text) IS
'The phone folding formula, written once. Must stay identical to lib/order-utils.ts normalizePhoneForSearch; both are pinned to lib/__fixtures__/phone-normalization.json. No SET search_path on purpose, so Postgres inlines it into per-row queries (orders search); every name inside is schema-qualified, so the caller''s search_path cannot change it. Supabase lint 0011 is accepted for this function (Fermi B9 part 2e). normalize_phone_for_search wraps it for indexes and keyed lookups.';

-- A wrapper's body runs as whoever calls it (any role that reads or writes
-- orders or customers, including index upkeep on every order write), and new
-- functions here get no EXECUTE by default, so the folds carry exactly the
-- wrappers' grants. They are pure formulas that read nothing.
GRANT EXECUTE ON FUNCTION public.search_fold_arabic(text) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_fold_phone(text) TO PUBLIC, anon, authenticated, service_role;

-- 2. The indexed names wrap them ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_arabic_text_for_search(_text text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'public'
AS $function$
    SELECT public.search_fold_arabic(_text);
$function$;

COMMENT ON FUNCTION public.normalize_arabic_text_for_search(text) IS
'Mirrors normalizeArabicText in lib/order-filter-utils.ts (the SEARCH variant, not the address-validator one). Pinned to lib/__fixtures__/arabic-normalization.json. The formula is public.search_fold_arabic; this wrapper keeps its SET search_path so it is never inlined, because expression indexes are built on it (Fermi B9 part 2e).';

CREATE OR REPLACE FUNCTION public.normalize_phone_for_search(_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'public'
AS $function$
    SELECT public.search_fold_phone(_phone);
$function$;

COMMENT ON FUNCTION public.normalize_phone_for_search(text) IS
'Canonical phone normalization for duplicate/blacklist/customer-history keying. Must stay identical to lib/order-utils.ts normalizePhoneForSearch; both are pinned to lib/__fixtures__/phone-normalization.json. The formula is public.search_fold_phone; this wrapper keeps its SET search_path so it is never inlined, because expression indexes are built on it (Fermi B9 part 2e).';

-- 3. Orders search folds inline --------------------------------------------------------
-- Built from the live body: it must hold exactly the 7 phone and 6 name folds
-- this was measured on, or this migration fails.
DO $b9$
DECLARE
    v_def text;
    v_phone_calls int;
    v_name_calls int;
BEGIN
    v_def := pg_get_functiondef('public.search_orders_v2(uuid,text,integer)'::regprocedure);
    v_phone_calls := array_length(string_to_array(v_def, 'public.normalize_phone_for_search('), 1) - 1;
    v_name_calls := array_length(string_to_array(v_def, 'public.normalize_arabic_text_for_search('), 1) - 1;
    IF v_phone_calls <> 7 OR v_name_calls <> 6 THEN
        RAISE EXCEPTION 'B9: search_orders_v2 is not the version this was built on (% phone, % name folds)',
            v_phone_calls, v_name_calls;
    END IF;
    v_def := replace(v_def, 'public.normalize_phone_for_search(', 'public.search_fold_phone(');
    v_def := replace(v_def, 'public.normalize_arabic_text_for_search(', 'public.search_fold_arabic(');
    EXECUTE v_def;
END
$b9$;