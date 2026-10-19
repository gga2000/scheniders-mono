CREATE OR REPLACE FUNCTION waseet_kind_of_token(p_token TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT CASE
    WHEN p_token IN ('حي','الحي','محله','المحله')                       THEN 'neighbourhood'
    WHEN p_token IN ('شارع','الشارع')                                    THEN 'street'
    WHEN p_token IN ('مجمع','المجمع','شقق','الشقق','عماره','العماره',
                     'دور','الدور','بنايه','البنايه')                    THEN 'complex'
    WHEN p_token IN ('قريه','القريه','قري','مزرعه','المزرعه','مزارع',
                     'مزراع')                                            THEN 'village'
    WHEN p_token IN ('ناحيه','الناحيه','منطقه','المنطقه')                THEN 'subdistrict'
    WHEN p_token IN ('سوق','السوق','سوك','مول','المول','علوه','العلوه')  THEN 'market'
    WHEN p_token IN ('مستشفي','المستشفي','مستوصف','المستوصف','عياده')     THEN 'hospital'
    WHEN p_token IN ('جامعه','الجامعه','كليه','الكليه','مدرسه','المدرسه',
                     'معهد','المعهد','ثانويه')                           THEN 'education'
    WHEN p_token IN ('فندق','الفندق','مطعم','المطعم','مقهي','المقهي',
                     'كافيه')                                            THEN 'venue'
    WHEN p_token IN ('جامع','الجامع','مقام','المقام','حسينيه','الحسينيه',
                     'كنيسه','الكنيسه','دير','الدير','مرقد')             THEN 'religious'
    WHEN p_token IN ('جسر','الجسر','طريق','الطريق','ساحه','الساحه',
                     'كراج','الكراج','بوابه','البوابه','سيطره','السيطره',
                     'مفرق','المفرق','دوار','الدوار','تقاطع','التقاطع',
                     'فلكه','الفلكه','نفق','النفق')                      THEN 'transit'
    WHEN p_token IN ('معمل','المعمل','مصنع','المصنع','معامل')            THEN 'industrial'
    WHEN p_token IN ('مخيم','المخيم')                                    THEN 'camp'
    ELSE NULL
  END;
$$;

DROP VIEW IF EXISTS waseet_destinations;
ALTER TABLE waseet_regions DROP COLUMN IF EXISTS place_kind;
ALTER TABLE waseet_regions
    ADD COLUMN place_kind TEXT GENERATED ALWAYS AS (waseet_place_kind(name_ar)) STORED;

CREATE OR REPLACE FUNCTION waseet_refresh_districts()
RETURNS TABLE (districts INT, assigned INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    WITH folded AS (
        SELECT r.id, r.city_id, r.name_search,
               string_to_array(r.name_search, ' ') AS toks,
               NULLIF(waseet_search_key(COALESCE(r.district_name, '')), '') AS dash_head
          FROM waseet_regions r
    ),
    separator AS (
        SELECT city_id, dash_head AS key, count(*) AS n
          FROM folded
         WHERE dash_head IS NOT NULL
         GROUP BY 1, 2
    ),
    prefix AS (
        SELECT f.city_id, f.toks[1] AS key, count(*) AS n
          FROM folded f
         WHERE f.dash_head IS NULL
           AND array_length(f.toks, 1) >= 2
           AND char_length(f.toks[1]) >= 3
           AND waseet_kind_of_token(f.toks[1]) IS NULL
           AND f.toks[1] <> ALL (ARRAY['مدينه','قضاء','قطاع','مركز','دوره','محافظه',
                                       'قرب','خلف','امام','مقابل','بجانب','اطراف','مدخل'])
           AND f.toks[1] !~ '(شارع|محله|مجمع|مستشفي)$'
         GROUP BY 1, 2
        HAVING count(*) >= 5
    ),
    candidate AS (
        SELECT city_id, key, 'separator'::TEXT AS source, n FROM separator
        UNION ALL
        SELECT p.city_id, p.key, 'prefix'::TEXT, p.n
          FROM prefix p
         WHERE NOT EXISTS (SELECT 1 FROM separator s
                            WHERE s.city_id = p.city_id AND s.key = p.key)
    ),
    promoted AS (
        SELECT c.city_id, c.source, c.n,
               COALESCE(
                 (SELECT x.p FROM (
                     SELECT array_to_string(f.toks[1:3], ' ') AS p, count(*) AS k
                       FROM folded f
                      WHERE f.city_id = c.city_id AND f.toks[1] = c.key
                        AND array_length(f.toks, 1) >= 3
                      GROUP BY 1 ORDER BY k DESC LIMIT 1) x
                   WHERE c.source = 'prefix' AND x.k >= c.n * 0.9),
                 (SELECT y.p FROM (
                     SELECT array_to_string(f.toks[1:2], ' ') AS p, count(*) AS k
                       FROM folded f
                      WHERE f.city_id = c.city_id AND f.toks[1] = c.key
                        AND array_length(f.toks, 1) >= 2
                      GROUP BY 1 ORDER BY k DESC LIMIT 1) y
                   WHERE c.source = 'prefix' AND y.k >= c.n * 0.9),
                 c.key) AS key
          FROM candidate c
    ),
    final AS (
        SELECT city_id, key, min(source) AS source, sum(n)::INT AS n
          FROM promoted
         GROUP BY 1, 2
    ),
    labelled AS (
        SELECT f.city_id, f.key, f.source, f.n,
               CASE WHEN f.source = 'separator' THEN COALESCE((
                       SELECT split_part(r.name_clean, ' - ', 1)
                         FROM waseet_regions r
                        WHERE r.city_id = f.city_id
                          AND waseet_search_key(COALESCE(r.district_name, '')) = f.key
                        GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), f.key)
                    ELSE COALESCE((
                       SELECT array_to_string(
                                (string_to_array(r.name_clean, ' '))
                                  [1 : array_length(string_to_array(f.key, ' '), 1)], ' ')
                         FROM waseet_regions r
                        WHERE r.city_id = f.city_id
                          AND (r.name_search = f.key OR r.name_search LIKE f.key || ' %')
                        GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), f.key)
               END AS label
          FROM final f
    ),
    upserted AS (
        INSERT INTO waseet_districts (city_id, name_search, name_ar, source, region_count)
        SELECT city_id, key, label, source, n
          FROM labelled
        ON CONFLICT (city_id, name_search) DO UPDATE
           SET name_ar = EXCLUDED.name_ar,
               source = EXCLUDED.source,
               region_count = EXCLUDED.region_count,
               synced_at = now()
        RETURNING id
    )
    SELECT count(*)::INT INTO districts FROM upserted;

    DELETE FROM waseet_districts d
     WHERE NOT EXISTS (
        SELECT 1 FROM waseet_regions r
         WHERE r.city_id = d.city_id
           AND (r.name_search = d.name_search OR r.name_search LIKE d.name_search || ' %'
                OR waseet_search_key(COALESCE(r.district_name, '')) = d.name_search));

    UPDATE waseet_regions SET district_id = NULL WHERE district_id IS NOT NULL;

    WITH matched AS (
        SELECT DISTINCT ON (r.id) r.id, d.id AS district_id
          FROM waseet_regions r
          JOIN waseet_districts d
            ON d.city_id = r.city_id
           AND (r.name_search = d.name_search
                OR r.name_search LIKE d.name_search || ' %'
                OR waseet_search_key(COALESCE(r.district_name, '')) = d.name_search)
         ORDER BY r.id, char_length(d.name_search) DESC
    )
    UPDATE waseet_regions r
       SET district_id = m.district_id
      FROM matched m
     WHERE r.id = m.id;

    SELECT count(*)::INT INTO assigned FROM waseet_regions WHERE district_id IS NOT NULL;
    SELECT count(*)::INT INTO districts FROM waseet_districts;
    RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_districts() FROM PUBLIC, anon, authenticated;

SELECT * FROM waseet_refresh_districts();
SELECT waseet_refresh_region_review();

CREATE OR REPLACE VIEW waseet_destinations
WITH (security_invoker = true)
AS
SELECT r.id                    AS region_id,
       r.name_clean            AS region_name,
       r.name_search           AS region_search,
       r.place_kind,
       d.id                    AS district_id,
       d.name_ar               AS district_name,
       d.source                AS district_source,
       d.region_count          AS district_region_count,
       c.id                    AS city_id,
       c.name_ar               AS city_name,
       c.governorate_code,
       r.canonical_id,
       (r.canonical_id = r.id) AS is_canonical,
       r.is_suspect
  FROM waseet_regions r
  JOIN waseet_cities c ON c.id = r.city_id
  LEFT JOIN waseet_districts d ON d.id = r.district_id
 WHERE r.is_active AND c.is_active;

COMMENT ON VIEW waseet_destinations IS
    'Cleaned Al-Waseet delivery destinations, governorate -> district -> region. Filter on is_canonical AND NOT is_suspect for a picker; query waseet_regions directly to resolve any historical id.';
