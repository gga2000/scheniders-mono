ALTER TABLE waseet_districts DROP CONSTRAINT IF EXISTS waseet_districts_source_check;
ALTER TABLE waseet_districts
    ADD CONSTRAINT waseet_districts_source_check
    CHECK (source IN ('separator','prefix','suffix'));

ALTER TABLE waseet_regions
    ADD COLUMN IF NOT EXISTS name_display      TEXT,
    ADD COLUMN IF NOT EXISTS name_search_split TEXT;

COMMENT ON COLUMN waseet_regions.name_display IS
    'name_clean with a run-together district prefix split apart; NULL when nothing was glued.';
COMMENT ON COLUMN waseet_regions.name_search_split IS
    'Search key matching name_display; NULL when nothing was glued.';

CREATE OR REPLACE FUNCTION waseet_sort_tokens(p_key TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(string_agg(tok, ' ' ORDER BY tok), '')
    FROM (SELECT DISTINCT unnest(string_to_array(p_key, ' ')) AS tok) s
   WHERE tok <> '';
$$;

CREATE OR REPLACE FUNCTION waseet_refresh_split_names()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_split INT;
BEGIN
    UPDATE waseet_regions
       SET name_display = NULL, name_search_split = NULL
     WHERE name_display IS NOT NULL OR name_search_split IS NOT NULL;

    WITH glued AS (
        SELECT DISTINCT ON (r.id)
               r.id,
               d.name_search AS base,
               substr(r.name_search, char_length(d.name_search) + 1) AS remainder
          FROM waseet_regions r
          JOIN waseet_districts d ON d.city_id = r.city_id
         WHERE r.name_search LIKE d.name_search || '%'
           AND r.name_search NOT LIKE d.name_search || ' %'
           AND r.name_search <> d.name_search
           AND char_length(substr(r.name_search, char_length(d.name_search) + 1)) >= 3
           AND substr(r.name_search, char_length(d.name_search) + 1) !~ '[0-9٠-٩]'
           AND substr(r.name_search, char_length(d.name_search) + 1)
               <> ALL (ARRAY['يون','يات','يين','تين','ايه','يته','يها','وين'])
           AND waseet_search_key(substr(r.name_clean, 1, char_length(d.name_search)))
               = d.name_search
         ORDER BY r.id, char_length(d.name_search) DESC
    )
    UPDATE waseet_regions r
       SET name_search_split = g.base || ' ' || g.remainder,
           name_display = btrim(substr(r.name_clean, 1, char_length(g.base)) || ' ' ||
                                substr(r.name_clean, char_length(g.base) + 1))
      FROM glued g
     WHERE r.id = g.id;

    GET DIAGNOSTICS v_split = ROW_COUNT;
    RETURN v_split;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_split_names() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION waseet_refresh_districts()
RETURNS TABLE (districts INT, assigned INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    WITH folded AS (
        SELECT r.id, r.city_id,
               COALESCE(r.name_search_split, r.name_search) AS key,
               string_to_array(COALESCE(r.name_search_split, r.name_search), ' ') AS toks,
               NULLIF(waseet_search_key(COALESCE(r.district_name, '')), '') AS dash_head
          FROM waseet_regions r
    ),
    separator AS (
        SELECT city_id, dash_head AS key, count(*) AS n
          FROM folded
         WHERE dash_head IS NOT NULL
         GROUP BY 1, 2
    ),
    prefix_raw AS (
        SELECT f.city_id, f.toks[1] AS key, count(*) AS n
          FROM folded f
         WHERE f.dash_head IS NULL
           AND array_length(f.toks, 1) >= 2
           AND char_length(f.toks[1]) >= 3
           AND waseet_kind_of_token(f.toks[1]) IS NULL
           AND f.toks[1] <> ALL (ARRAY['مدينه','قضاء','قطاع','مركز','دوره','محافظه',
                                       'قرب','خلف','امام','مقابل','بجانب','اطراف','مدخل'])
           AND f.toks[1] !~ '(شارع|محله|مجمع|مستشفي|ناحيه)$'
         GROUP BY 1, 2
        HAVING count(*) >= 5
    ),
    prefix AS (
        SELECT p.*
          FROM prefix_raw p
         WHERE NOT EXISTS (SELECT 1 FROM prefix_raw q
                            WHERE q.city_id = p.city_id AND q.key <> p.key
                              AND p.key LIKE q.key || '%' AND q.n > p.n)
           AND NOT EXISTS (SELECT 1 FROM separator s
                            WHERE s.city_id = p.city_id AND s.key <> p.key
                              AND p.key LIKE s.key || '%' AND s.n > p.n)
    ),
    suffix AS (
        SELECT f.city_id, f.toks[array_length(f.toks, 1)] AS key, count(*) AS n
          FROM folded f
         WHERE f.dash_head IS NULL
           AND array_length(f.toks, 1) >= 2
           AND char_length(f.toks[array_length(f.toks, 1)]) >= 4
           AND waseet_kind_of_token(f.toks[array_length(f.toks, 1)]) IS NULL
           AND f.toks[array_length(f.toks, 1)] <> ALL (ARRAY[
                 'الاولي','الثانيه','الثالثه','الرابعه','الخامسه','السادسه','السابعه',
                 'الثامنه','التاسعه','العاشره','اولي','ثانيه','ثالثه','رابعه','خامسه',
                 'الجديده','القديمه','الكبيره','الصغيره','الشماليه','الجنوبيه',
                 'الشرقيه','الغربيه','الوسطي','بغداد','العراق','مركز','الرئيسي'])
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
        UNION ALL
        SELECT x.city_id, x.key, 'suffix'::TEXT, x.n
          FROM suffix x
         WHERE NOT EXISTS (SELECT 1 FROM separator s
                            WHERE s.city_id = x.city_id AND s.key = x.key)
           AND NOT EXISTS (SELECT 1 FROM prefix p
                            WHERE p.city_id = x.city_id AND p.key = x.key)
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
                    WHEN f.source = 'suffix' THEN COALESCE((
                       SELECT (string_to_array(COALESCE(r.name_display, r.name_clean), ' '))
                                [array_length(string_to_array(COALESCE(r.name_display, r.name_clean), ' '), 1)]
                         FROM waseet_regions r
                        WHERE r.city_id = f.city_id
                          AND COALESCE(r.name_search_split, r.name_search) LIKE '% ' || f.key
                        GROUP BY 1 ORDER BY count(*) DESC LIMIT 1), f.key)
                    ELSE COALESCE((
                       SELECT array_to_string(
                                (string_to_array(COALESCE(r.name_display, r.name_clean), ' '))
                                  [1 : array_length(string_to_array(f.key, ' '), 1)], ' ')
                         FROM waseet_regions r
                        WHERE r.city_id = f.city_id
                          AND (COALESCE(r.name_search_split, r.name_search) = f.key
                               OR COALESCE(r.name_search_split, r.name_search) LIKE f.key || ' %')
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

    DELETE FROM waseet_districts
     WHERE synced_at < (SELECT max(synced_at) FROM waseet_districts);

    UPDATE waseet_regions SET district_id = NULL WHERE district_id IS NOT NULL;

    WITH matched AS (
        SELECT DISTINCT ON (r.id) r.id, d.id AS district_id
          FROM waseet_regions r
          JOIN waseet_districts d
            ON d.city_id = r.city_id
           AND (CASE d.source
                  WHEN 'suffix' THEN COALESCE(r.name_search_split, r.name_search) LIKE '% ' || d.name_search
                  ELSE COALESCE(r.name_search_split, r.name_search) = d.name_search
                       OR COALESCE(r.name_search_split, r.name_search) LIKE d.name_search || ' %'
                       OR waseet_search_key(COALESCE(r.district_name, '')) = d.name_search
                END)
         ORDER BY r.id, (d.source = 'suffix'), char_length(d.name_search) DESC
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

CREATE OR REPLACE FUNCTION waseet_refresh_canonical_regions()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_duplicates INT;
BEGIN
    WITH ranked AS (
        SELECT id,
               min(id) OVER (
                 PARTITION BY city_id,
                              waseet_sort_tokens(COALESCE(name_search_split, name_search))
               ) AS canonical
          FROM waseet_regions
    )
    UPDATE waseet_regions r
       SET canonical_id = ranked.canonical
      FROM ranked
     WHERE r.id = ranked.id
       AND r.canonical_id IS DISTINCT FROM ranked.canonical;

    SELECT count(*) INTO v_duplicates FROM waseet_regions WHERE canonical_id <> id;
    RETURN v_duplicates;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_canonical_regions() FROM PUBLIC, anon, authenticated;

SELECT * FROM waseet_refresh_districts();
SELECT waseet_refresh_split_names();
SELECT * FROM waseet_refresh_districts();
SELECT waseet_refresh_canonical_regions();
SELECT waseet_refresh_region_review();

DROP VIEW IF EXISTS waseet_destinations;

CREATE VIEW waseet_destinations
WITH (security_invoker = true)
AS
SELECT r.id                                          AS region_id,
       COALESCE(r.name_display, r.name_clean)        AS region_name,
       COALESCE(r.name_search_split, r.name_search)  AS region_search,
       r.name_clean                                  AS region_name_unsplit,
       r.place_kind,
       d.id                                          AS district_id,
       d.name_ar                                     AS district_name,
       d.source                                      AS district_source,
       d.region_count                                AS district_region_count,
       c.id                                          AS city_id,
       c.name_ar                                     AS city_name,
       c.governorate_code,
       r.canonical_id,
       (r.canonical_id = r.id)                       AS is_canonical,
       r.is_suspect
  FROM waseet_regions r
  JOIN waseet_cities c ON c.id = r.city_id
  LEFT JOIN waseet_districts d ON d.id = r.district_id
 WHERE r.is_active AND c.is_active;

COMMENT ON VIEW waseet_destinations IS
    'Cleaned Al-Waseet delivery destinations, governorate -> district -> region. Filter on is_canonical AND NOT is_suspect for a picker; query waseet_regions directly to resolve any historical id.';
