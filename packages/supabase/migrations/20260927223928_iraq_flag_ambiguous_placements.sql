-- A fifth of gazetteer placements come from a length tie between two districts. The ranking
-- rules (governorate qualifier last, own name over area, sourced unit over derived cluster)
-- settle nearly all of them on evidence, but a residue is still decided by district_id order,
-- i.e. arbitrarily. Those rows must not read as confident placements.
--
-- This marks them needs_review with the competing districts spelled out, and clears the flag
-- again if a later gazetteer change makes the row unambiguous. It only touches rows whose
-- review_status is 'ok' or already carries this same reason, so hand-written review notes and
-- the other review categories are left alone.
CREATE OR REPLACE FUNCTION public.iraq_flag_ambiguous_placements()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '180s'
AS $function$
DECLARE
    v_flagged INT;
    c_prefix CONSTANT TEXT := 'Two districts match this name equally well';
BEGIN
    CREATE TEMP TABLE _amb ON COMMIT DROP AS
    WITH target AS MATERIALIZED (
        SELECT l.id, l.governorate_code,
               waseet_strip_article(waseet_search_key(g.name_ar)) AS gov_key,
               string_to_array(waseet_strip_article(l.name_search), ' ') AS toks
          FROM iraq_locations l
          JOIN iraq_governorates g ON g.code = l.governorate_code
         WHERE l.district_is_manual = false
           AND l.district_source = 'gazetteer'
           AND l.is_active
    ),
    phrase AS MATERIALIZED (
        SELECT t.id, t.governorate_code,
               array_to_string(t.toks[i:j], ' ') AS p,
               (i = j AND t.toks[i] = t.gov_key
                      AND COALESCE(array_length(t.toks, 1), 0) > 1) AS is_gov_qualifier
          FROM target t,
               LATERAL generate_series(1, COALESCE(array_length(t.toks, 1), 0)) AS i,
               LATERAL generate_series(i, LEAST(i + 4, COALESCE(array_length(t.toks, 1), 0))) AS j
    ),
    hit AS (
        SELECT ph.id, a.district_id, d.name_ar AS district_name,
               char_length(ph.p) AS len, ph.is_gov_qualifier,
               (a.area_key = waseet_strip_article(waseet_search_key(d.name_ar))) AS is_own_name,
               (d.kind <> 'area_cluster') AS is_sourced_unit
          FROM phrase ph
          JOIN iraq_district_areas a ON a.area_key = ph.p
          JOIN iraq_districts d ON d.id = a.district_id
         WHERE d.governorate_code = ph.governorate_code
           AND char_length(ph.p) >= 2
           AND char_length(waseet_search_key(a.area_ar)) >= 3
    ),
    ranked AS (
        -- keep only the candidates that survive every ranking rule; if more than one district
        -- remains at that point, district_id broke the tie and the placement is a guess.
        SELECT h.*,
               rank() OVER (PARTITION BY h.id
                            ORDER BY h.is_gov_qualifier, h.len DESC,
                                     h.is_own_name DESC, h.is_sourced_unit DESC) AS rk
          FROM hit h
    )
    SELECT r.id, string_agg(DISTINCT r.district_name, ' / ' ORDER BY r.district_name) AS rivals
      FROM ranked r
     WHERE r.rk = 1
     GROUP BY r.id
    HAVING count(DISTINCT r.district_id) > 1;

    -- clear the flag where it no longer applies
    UPDATE iraq_locations l
       SET review_status = 'ok', review_reason = NULL, updated_at = now()
     WHERE l.review_reason LIKE c_prefix || '%'
       AND NOT EXISTS (SELECT 1 FROM _amb a WHERE a.id = l.id);

    UPDATE iraq_locations l
       SET review_status = 'needs_review',
           review_reason = c_prefix || ': ' || a.rivals
                        || '. The winner was picked arbitrarily — confirm it.',
           updated_at = now()
      FROM _amb a
     WHERE l.id = a.id
       AND (l.review_status = 'ok' OR l.review_reason LIKE c_prefix || '%');

    SELECT count(*)::INT INTO v_flagged FROM _amb;
    RETURN v_flagged;
END;
$function$;

SELECT public.iraq_flag_ambiguous_placements();
