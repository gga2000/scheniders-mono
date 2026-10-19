-- PERF-1 Stage 2 / Prerequisite A — canonical phone normalization in the database.
--
-- WHY
-- Duplicate detection, the blacklist and customer history all key on a
-- normalized phone that until now existed ONLY in TypeScript
-- (lib/order-utils.ts `normalizePhoneForSearch`). Moving duplicate counts and
-- customer history to the server needs the same normalization in SQL, and it
-- also gives the eventual server-side phone search an index to use.
--
-- FAITHFUL PORT — the two implementations must agree forever. Order matters:
--   1. Arabic-Indic ٠-٩ -> ASCII
--   2. drop every non-digit
--   3. strip a leading `964` (ONCE)
--   4. THEN strip a single leading `0`
-- so `0964…` keeps its `964` (the zero is what comes off) and `00964…` is NOT
-- special-cased. That mirrors the TypeScript exactly, including its rough edges;
-- "fixing" one side alone would silently change duplicate badges. Both are
-- pinned to lib/__fixtures__/phone-normalization.json, verified 12/12 on each
-- side. Note only ٠-٩ (U+0660-0669) is handled, not Persian ۰-۹ (U+06F0-06F9) —
-- again matching the TypeScript.
--
-- Live data at time of writing (21,978 phones): 0 Arabic-Indic, 1,732 carrying a
-- 964 country code (1,730 written as +964), 20,223 leading-zero, 0 empty — so
-- the 964 branch is genuinely exercised in production.
--
-- WHY A FUNCTION + EXPRESSION INDEX RATHER THAN A GENERATED COLUMN
-- A `GENERATED ALWAYS AS … STORED` column would rewrite all 14 MB of the heap
-- under an ACCESS EXCLUSIVE lock. An IMMUTABLE function plus an expression index
-- gives the same query power with no table rewrite.
--
-- DOWN MIGRATION:
--   DROP INDEX IF EXISTS public.idx_orders_tenant_normphone;
--   DROP FUNCTION IF EXISTS public.normalize_phone_for_search(text);

CREATE OR REPLACE FUNCTION public.normalize_phone_for_search(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
RETURNS NULL ON NULL INPUT
SET search_path TO 'public'
AS $function$
    SELECT regexp_replace(
             regexp_replace(
               regexp_replace(translate(_phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g'),
             '^964', ''),
           '^0', '');
$function$;

COMMENT ON FUNCTION public.normalize_phone_for_search(text) IS
    'Canonical phone normalization for duplicate/blacklist/customer-history keying. Must stay identical to lib/order-utils.ts normalizePhoneForSearch; both are pinned to lib/__fixtures__/phone-normalization.json.';

CREATE INDEX IF NOT EXISTS idx_orders_tenant_normphone
    ON public.orders (tenant_id, public.normalize_phone_for_search(phone));;
