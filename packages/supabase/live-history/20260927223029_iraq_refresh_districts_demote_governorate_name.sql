-- A phrase that is just the governorate's own name ("كربلاء" inside "كربلاء الهنديه",
-- "دهوك" inside "دهوك سميل") is a qualifier, not a placement signal: Al-Waseet prefixes
-- the governorate to disambiguate the row, then names the real place after it. Because the
-- capital qadha carries the governorate name as an area, the longest-phrase rule was letting
-- that qualifier outrank the specific qadha actually named in the row.
--
-- Fix: rank a governorate-name match last, so it only wins when nothing else in the name
-- matches ("مصفى كربلاء", "قناة كربلاء" still land on قضاء كربلاء).
CREATE OR REPLACE FUNCTION public.iraq_refresh_location_districts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_placed INT;
BEGIN
    UPDATE iraq_locations SET district_id = NULL
     WHERE district_is_manual = false
       AND district_source = 'gazetteer'
       AND district_id IS NOT NULL;

    WITH target AS (
        SELECT l.id, l.governorate_code,
               string_to_array(waseet_strip_article(l.name_search), ' ') AS toks
          FROM iraq_locations l
         WHERE l.district_is_manual = false
           AND l.district_source = 'gazetteer'
           AND l.is_active
    ),
    gov AS (
        SELECT g.code, waseet_strip_article(waseet_search_key(g.name_ar)) AS gov_key
          FROM iraq_governorates g
    ),
    phrase AS (
        -- every run of 1-5 consecutive words in the name
        SELECT t.id, t.governorate_code,
               array_to_string(t.toks[i:j], ' ') AS p,
               COALESCE(array_length(t.toks, 1), 0) AS n_toks
          FROM target t,
               LATERAL generate_series(1, COALESCE(array_length(t.toks, 1), 0)) AS i,
               LATERAL generate_series(i, LEAST(i + 4, COALESCE(array_length(t.toks, 1), 0))) AS j
    ),
    hit AS (
        SELECT ph.id, a.district_id, char_length(ph.p) AS len,
               -- demote only when the governorate name is a *part* of a longer name;
               -- a row called exactly "كربلاء" has nothing else to go on.
               (ph.p = gov.gov_key AND ph.n_toks > 1) AS is_gov_qualifier
          FROM phrase ph
          JOIN gov ON gov.code = ph.governorate_code
          JOIN iraq_district_areas a ON a.area_key = ph.p
          JOIN iraq_districts d ON d.id = a.district_id
         WHERE d.governorate_code = ph.governorate_code
           AND char_length(ph.p) >= 2
           AND char_length(waseet_search_key(a.area_ar)) >= 3
    ),
    best AS (
        SELECT DISTINCT ON (id) id, district_id
          FROM hit ORDER BY id, is_gov_qualifier, len DESC, district_id
    )
    UPDATE iraq_locations l
       SET district_id = best.district_id, updated_at = now()
      FROM best WHERE l.id = best.id;

    SELECT count(*)::INT INTO v_placed FROM iraq_locations WHERE district_id IS NOT NULL;
    RETURN v_placed;
END;
$function$;;
