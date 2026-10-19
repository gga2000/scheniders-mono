-- The Mosul city gazetteer (142 quarters) exposed a flaw in the ranking: a long generic quarter
-- name belonging to one district was outranking a short name that IS another district.
-- "تلعفر حي القادسية" went to الموصل because "قادسيه" (7 chars) beat the explicit "تلعفر" (5),
-- and eleven "الدورة - X" rows were landing in الرشيد, المنصور and الغدير.
--
-- A row that names a district outright is stronger evidence than a longer phrase matching some
-- other district's constituent area, so is_own_name now ranks ahead of length.
--
-- With one guard, without which this regresses: the own-name only counts when no LONGER matched
-- phrase contains it. "كرادة مريم" is in الكرخ, not الكرادة, and "ناحية الرشيد" is a nahiya of
-- المحمودية rather than بلدية الرشيد — in both the district name is a prefix of the more specific
-- area, and there the longer area must still win. The guard also protects "صوب الشامية"
-- (a Diwaniyah city quarter, not قضاء الشامية) and "قلعة السكر" (a nahiya of الرفاعي).
--
-- Reviewed all 33 resulting changes by hand. One stays wrong: "قرة تبة حي الشهداء" moves to a
-- derived الشهداء cluster instead of قضاء كفري. Removing that junk cluster was declined, so the
-- row is left to be caught by iraq_flag_ambiguous_placements rather than quietly mis-filed.
CREATE OR REPLACE FUNCTION public.iraq_refresh_location_districts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '180s'
AS $function$
DECLARE
    v_placed INT;
BEGIN
    UPDATE iraq_locations SET district_id = NULL
     WHERE district_is_manual = false
       AND district_source = 'gazetteer'
       AND district_id IS NOT NULL;

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
    hit AS MATERIALIZED (
        SELECT ph.id, a.district_id, ph.p, char_length(ph.p) AS len, ph.is_gov_qualifier,
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
        SELECT h.*,
               (h.is_own_name AND NOT EXISTS (
                  SELECT 1 FROM hit o
                   WHERE o.id = h.id AND o.len > h.len AND o.p LIKE '%' || h.p || '%'
               )) AS strong_own_name
          FROM hit h
    ),
    best AS (
        SELECT DISTINCT ON (id) id, district_id
          FROM ranked
         ORDER BY id, is_gov_qualifier, strong_own_name DESC, len DESC,
                  is_own_name DESC, is_sourced_unit DESC, district_id
    )
    UPDATE iraq_locations l
       SET district_id = best.district_id, updated_at = now()
      FROM best WHERE l.id = best.id;

    SELECT count(*)::INT INTO v_placed FROM iraq_locations WHERE district_id IS NOT NULL;
    RETURN v_placed;
END;
$function$;;
