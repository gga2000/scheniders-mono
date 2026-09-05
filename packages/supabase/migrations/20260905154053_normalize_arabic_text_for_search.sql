-- PERF-1 stage 4 groundwork — Arabic text normalization in SQL.
--
-- WHY
-- Order search matches customer name, city, address and notes through
-- `normalizeArabicText` (lib/order-filter-utils.ts). Moving search server-side —
-- so typing a query stops falling back to a whole-book download — needs the
-- identical normalization in SQL.
--
-- MIRRORS THE SEARCH NORMALIZER, NOT THE OTHER ONE. There are two
-- `normalizeArabicText` implementations in the codebase and they disagree:
--   lib/order-filter-utils.ts (search)     folds ى -> ي, ignores Kurdish/Farsi forms
--   lib/address-validator.ts (governorate) folds ی ک ە, does NOT fold ى,
--                                          and collapses whitespace
-- Live data has 1,647 names containing ى and a handful with Kurdish ی, so the
-- divergence is real, not theoretical: a name search and a governorate match
-- normalize the same customer differently today. This function reproduces the
-- SEARCH variant exactly, because its job is to return the same rows the client
-- returns now. Reconciling the two is a separate decision with its own
-- behaviour change, filed rather than smuggled in here.
--
-- CODEPOINTS ARE NUMERIC ON PURPOSE: the diacritic range U+064B..U+065F is
-- immediately followed by the Arabic-Indic digits U+0660..U+0669. Writing the
-- class with literal characters made it trivially easy to typo a range that
-- silently ate every Arabic digit in a customer's name — which happened while
-- developing this, and passed a hand-written test because the sample had no
-- digits. chr() makes the boundary explicit and reviewable.
--   1611 = U+064B   1631 = U+065F   1648 = U+0670
--
-- Verified 11/11 against lib/__fixtures__/arabic-normalization.json, the same
-- fixture the TypeScript test uses.
--
-- DOWN MIGRATION:
--   DROP FUNCTION IF EXISTS public.normalize_arabic_text_for_search(text);

CREATE OR REPLACE FUNCTION public.normalize_arabic_text_for_search(_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path TO 'public'
AS $function$
    SELECT lower(trim(
        translate(
            regexp_replace(
                regexp_replace(_text, '[' || chr(1611) || '-' || chr(1631) || ']', '', 'g'),
                chr(1648), '', 'g'),
            'آأإةى',
            'اااهي'
        )
    ));
$function$;

COMMENT ON FUNCTION public.normalize_arabic_text_for_search(text) IS
    'Mirrors normalizeArabicText in lib/order-filter-utils.ts (the SEARCH variant, not the address-validator one). Pinned to lib/__fixtures__/arabic-normalization.json.';
