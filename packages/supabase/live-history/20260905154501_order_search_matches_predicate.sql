-- PERF-1 stage 4 — the order-search predicate, defined once.
--
-- WHY ONE FUNCTION
-- Search has to be applied in two places: the rows the list fetches, and the
-- counts `get_orders_aggregates` reports. If those two ever apply search
-- differently the chips contradict the list — the exact failure this whole
-- effort has been guarding against. So the predicate is written once here and
-- called from both.
--
-- FAITHFUL PORT of the client matcher (hooks/use-order-filters.ts, the
-- `activeFilters.searchQuery` branch). An order matches when ANY of these hold:
--   * customer name / city / address / notes CONTAIN the Arabic-normalized term
--   * normalized phone or secondary phone CONTAINS the normalized digits of the
--     term (only when the term actually contains digits — otherwise a text
--     search would match every phone via the empty string)
--   * order_id or delivery_order_id CONTAIN the lowercased raw term
--   * sequence_number, as text, CONTAINS the lowercased raw term
-- An empty term matches everything, mirroring the client's early return.
--
-- Both normalizers are the already-pinned ones: normalize_arabic_text_for_search
-- (11/11 against its fixture) and normalize_phone_for_search (21,978/21,978
-- against real data).
--
-- DOWN MIGRATION:
--   DROP FUNCTION IF EXISTS public.order_search_matches(text,text,text,text,text,text,text,text,text,int4);

CREATE OR REPLACE FUNCTION public.order_search_matches(
    _term               text,
    _customer_name      text,
    _phone              text,
    _secondary_phone    text,
    _city               text,
    _address_details    text,
    _notes              text,
    _order_id           text,
    _delivery_order_id  text,
    _sequence_number    int4
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $function$
    WITH q AS (
        SELECT
            public.normalize_arabic_text_for_search(coalesce(_term, '')) AS text_q,
            lower(btrim(coalesce(_term, '')))                            AS raw_q,
            public.normalize_phone_for_search(coalesce(_term, ''))       AS phone_q
    )
    SELECT
        CASE
            -- Empty query matches everything (mirrors the client's early return).
            WHEN (SELECT text_q FROM q) = '' AND (SELECT raw_q FROM q) = '' THEN true
            ELSE
                   ((SELECT text_q FROM q) <> '' AND _customer_name IS NOT NULL
                     AND public.normalize_arabic_text_for_search(_customer_name) LIKE '%' || (SELECT text_q FROM q) || '%')
                OR ((SELECT text_q FROM q) <> '' AND _city IS NOT NULL
                     AND public.normalize_arabic_text_for_search(_city) LIKE '%' || (SELECT text_q FROM q) || '%')
                OR ((SELECT text_q FROM q) <> '' AND _address_details IS NOT NULL
                     AND public.normalize_arabic_text_for_search(_address_details) LIKE '%' || (SELECT text_q FROM q) || '%')
                OR ((SELECT text_q FROM q) <> '' AND _notes IS NOT NULL
                     AND public.normalize_arabic_text_for_search(_notes) LIKE '%' || (SELECT text_q FROM q) || '%')
                -- Phone only when the term has digits, or the empty normalized
                -- phone would substring-match every order.
                OR ((SELECT phone_q FROM q) <> '' AND _phone IS NOT NULL
                     AND public.normalize_phone_for_search(_phone) LIKE '%' || (SELECT phone_q FROM q) || '%')
                OR ((SELECT phone_q FROM q) <> '' AND _secondary_phone IS NOT NULL
                     AND public.normalize_phone_for_search(_secondary_phone) LIKE '%' || (SELECT phone_q FROM q) || '%')
                OR ((SELECT raw_q FROM q) <> '' AND _order_id IS NOT NULL
                     AND lower(_order_id) LIKE '%' || (SELECT raw_q FROM q) || '%')
                OR ((SELECT raw_q FROM q) <> '' AND _delivery_order_id IS NOT NULL
                     AND lower(_delivery_order_id) LIKE '%' || (SELECT raw_q FROM q) || '%')
                OR ((SELECT raw_q FROM q) <> '' AND _sequence_number IS NOT NULL
                     AND _sequence_number::text LIKE '%' || (SELECT raw_q FROM q) || '%')
        END;
$function$;

COMMENT ON FUNCTION public.order_search_matches(text,text,text,text,text,text,text,text,text,int4) IS
    'Single definition of the order-search predicate, shared by the windowed list fetch and get_orders_aggregates so the list and its counts can never apply search differently. Mirrors the searchQuery branch of hooks/use-order-filters.ts.';;
