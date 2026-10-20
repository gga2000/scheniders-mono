-- The gazetteer writes "المنصور" and "الشيخ معروف"; the catalogue writes
-- "منصور" and "شيخ معروف". The definite article is optional in Iraqi address
-- writing, so it must not decide whether an area matches.
CREATE OR REPLACE FUNCTION waseet_strip_article(p_key TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT btrim(regexp_replace(regexp_replace(p_key, '(^|\s)ال', '\1', 'g'), '\s+', ' ', 'g'));
$$;

CREATE OR REPLACE FUNCTION waseet_refresh_municipalities()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_matched INT;
BEGIN
    UPDATE waseet_regions SET municipality_ar = NULL WHERE municipality_ar IS NOT NULL;

    WITH r AS (
        SELECT reg.id, reg.city_id,
               waseet_strip_article(COALESCE(reg.name_search_split, reg.name_search)) AS k
          FROM waseet_regions reg
    ),
    g AS (
        SELECT gz.governorate_code, gz.parent_ar,
               waseet_strip_article(gz.area_search) AS k
          FROM waseet_gazetteer gz
    ),
    m AS (
        SELECT DISTINCT ON (r.id) r.id, g.parent_ar
          FROM r
          JOIN waseet_cities c ON c.id = r.city_id
          JOIN g ON g.governorate_code = c.governorate_code
         WHERE r.k = g.k
            OR r.k LIKE g.k || ' %'
            OR r.k LIKE '% ' || g.k
            OR r.k LIKE '% ' || g.k || ' %'
         ORDER BY r.id, char_length(g.k) DESC
    )
    UPDATE waseet_regions reg SET municipality_ar = m.parent_ar FROM m WHERE reg.id = m.id;

    SELECT count(*)::INT INTO v_matched FROM waseet_regions WHERE municipality_ar IS NOT NULL;
    RETURN v_matched;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_municipalities() FROM PUBLIC, anon, authenticated;

SELECT waseet_refresh_municipalities();
