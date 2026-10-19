-- When two districts match phrases of equal length, the old rule broke the tie on district_id,
-- which is arbitrary: "بغداد الامين نواب ضباط" went to الرشيد (whose area list happens to hold
-- "ضباط") instead of الامين, and "النشوة - بصرة" went to شط العرب (which lists نشوة as an area)
-- instead of the قضاء النشوة itself.
--
-- A phrase matching a district's OWN name is stronger evidence than the same-length phrase
-- matching one of its constituent areas, so rank that first and keep district_id only as the
-- final, deterministic fallback.
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
        -- every run of 1-5 consecutive words in the name; a bare governorate name inside a
        -- longer name is a qualifier Al-Waseet prefixed, not the place being named.
        SELECT t.id, t.governorate_code,
               array_to_string(t.toks[i:j], ' ') AS p,
               (i = j AND t.toks[i] = t.gov_key
                      AND COALESCE(array_length(t.toks, 1), 0) > 1) AS is_gov_qualifier
          FROM target t,
               LATERAL generate_series(1, COALESCE(array_length(t.toks, 1), 0)) AS i,
               LATERAL generate_series(i, LEAST(i + 4, COALESCE(array_length(t.toks, 1), 0))) AS j
    ),
    hit AS (
        SELECT ph.id, a.district_id, char_length(ph.p) AS len, ph.is_gov_qualifier,
               (a.area_key = waseet_strip_article(waseet_search_key(d.name_ar))) AS is_own_name
          FROM phrase ph
          JOIN iraq_district_areas a ON a.area_key = ph.p
          JOIN iraq_districts d ON d.id = a.district_id
         WHERE d.governorate_code = ph.governorate_code
           AND char_length(ph.p) >= 2
           AND char_length(waseet_search_key(a.area_ar)) >= 3
    ),
    best AS (
        SELECT DISTINCT ON (id) id, district_id
          FROM hit
         ORDER BY id, is_gov_qualifier, len DESC, is_own_name DESC, district_id
    )
    UPDATE iraq_locations l
       SET district_id = best.district_id, updated_at = now()
      FROM best WHERE l.id = best.id;

    SELECT count(*)::INT INTO v_placed FROM iraq_locations WHERE district_id IS NOT NULL;
    RETURN v_placed;
END;
$function$;
