-- ARCH-4 follow-up: normalize_phone_for_search mishandled the 00 international
-- access code. It stripped '^964' and then '^0', so '009647701234567' lost only
-- one leading zero and became '09647701234567' — a number in that form could
-- never match a stored one. The TypeScript twin in lib/order-utils.ts had the
-- identical defect; both are changed together, and the shared fixture
-- lib/__fixtures__/phone-normalization.json is updated in the same commit.
--
-- Stripping '^00' first makes the country code visible to the existing '^964'
-- rule. A local Iraqi number never begins with 00, so this cannot remove a real
-- prefix. Single-strip semantics are preserved elsewhere: '964964...' still
-- loses only one 964, which the fixture pins.

CREATE OR REPLACE FUNCTION public.normalize_phone_for_search(_phone text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'public'
AS $function$
    SELECT regexp_replace(
             regexp_replace(
               regexp_replace(
                 regexp_replace(translate(_phone, '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g'),
               '^00', ''),
             '^964', ''),
           '^0', '');
$function$;

-- idx_orders_tenant_normphone is a functional index on this function. Postgres
-- does not recompute stored index entries when an IMMUTABLE function changes,
-- so the index must be rebuilt or it would silently disagree with the function.
REINDEX INDEX public.idx_orders_tenant_normphone;;
