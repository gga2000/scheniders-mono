CREATE OR REPLACE FUNCTION waseet_kind_of_token(p_token TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT CASE p_token
    WHEN 'حي' THEN 'neighbourhood'   WHEN 'محله' THEN 'neighbourhood'
    WHEN 'شارع' THEN 'street'
    WHEN 'مجمع' THEN 'complex'       WHEN 'شقق' THEN 'complex'
    WHEN 'عماره' THEN 'complex'      WHEN 'دور' THEN 'complex'
    WHEN 'قريه' THEN 'village'
    WHEN 'ناحيه' THEN 'subdistrict'  WHEN 'منطقه' THEN 'subdistrict'
    WHEN 'سوق' THEN 'market'         WHEN 'مول' THEN 'market'
    WHEN 'علوه' THEN 'market'
    WHEN 'مستشفي' THEN 'hospital'    WHEN 'مستوصف' THEN 'hospital'
    WHEN 'جامعه' THEN 'education'    WHEN 'كليه' THEN 'education'
    WHEN 'مدرسه' THEN 'education'    WHEN 'معهد' THEN 'education'
    WHEN 'فندق' THEN 'venue'         WHEN 'مطعم' THEN 'venue'
    WHEN 'مقهي' THEN 'venue'
    WHEN 'جامع' THEN 'religious'     WHEN 'مقام' THEN 'religious'
    WHEN 'حسينيه' THEN 'religious'   WHEN 'كنيسه' THEN 'religious'
    WHEN 'دير' THEN 'religious'
    WHEN 'جسر' THEN 'transit'        WHEN 'طريق' THEN 'transit'
    WHEN 'ساحه' THEN 'transit'       WHEN 'كراج' THEN 'transit'
    WHEN 'بوابه' THEN 'transit'      WHEN 'سيطره' THEN 'transit'
    WHEN 'مفرق' THEN 'transit'       WHEN 'دوار' THEN 'transit'
    WHEN 'معمل' THEN 'industrial'    WHEN 'مصنع' THEN 'industrial'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION waseet_place_kind(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT COALESCE((
    SELECT waseet_kind_of_token(t.tok)
      FROM unnest(string_to_array(waseet_search_key(p_name), ' ')) WITH ORDINALITY AS t(tok, ord)
     WHERE waseet_kind_of_token(t.tok) IS NOT NULL
     ORDER BY t.ord
     LIMIT 1
  ), 'area');
$$;

CREATE OR REPLACE FUNCTION waseet_name_key_sorted(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT COALESCE(string_agg(tok, ' ' ORDER BY tok), '')
    FROM (
      SELECT DISTINCT unnest(string_to_array(waseet_search_key(p_name), ' ')) AS tok
    ) s
   WHERE tok <> '';
$$;

DROP VIEW IF EXISTS waseet_destinations;

ALTER TABLE waseet_regions DROP COLUMN IF EXISTS place_kind;
ALTER TABLE waseet_regions
    ADD COLUMN place_kind TEXT GENERATED ALWAYS AS (waseet_place_kind(name_ar)) STORED,
    ADD COLUMN IF NOT EXISTS name_key_sorted TEXT GENERATED ALWAYS AS (waseet_name_key_sorted(name_ar)) STORED;

CREATE TABLE IF NOT EXISTS waseet_districts (
    id           INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    city_id      INT NOT NULL REFERENCES waseet_cities(id) ON DELETE CASCADE,
    name_search  TEXT NOT NULL,
    name_ar      TEXT NOT NULL,
    source       TEXT NOT NULL CHECK (source IN ('separator','prefix')),
    region_count INT NOT NULL DEFAULT 0,
    synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (city_id, name_search)
);

CREATE INDEX IF NOT EXISTS idx_waseet_districts_city ON waseet_districts(city_id);

ALTER TABLE waseet_regions
    ADD COLUMN IF NOT EXISTS district_id INT REFERENCES waseet_districts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_waseet_regions_district_id ON waseet_regions(district_id);

ALTER TABLE waseet_districts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read on waseet_districts" ON waseet_districts;
CREATE POLICY "Public read on waseet_districts"
    ON waseet_districts FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Service role all on waseet_districts" ON waseet_districts;
CREATE POLICY "Service role all on waseet_districts"
    ON waseet_districts FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON waseet_districts FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS waseet_region_review (
    a_id       INT NOT NULL REFERENCES waseet_regions(id) ON DELETE CASCADE,
    b_id       INT NOT NULL REFERENCES waseet_regions(id) ON DELETE CASCADE,
    city_id    INT NOT NULL REFERENCES waseet_cities(id) ON DELETE CASCADE,
    similarity REAL NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (a_id, b_id),
    CHECK (a_id < b_id)
);

CREATE INDEX IF NOT EXISTS idx_waseet_region_review_city ON waseet_region_review(city_id);

ALTER TABLE waseet_region_review ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read on waseet_region_review" ON waseet_region_review;
CREATE POLICY "Authenticated read on waseet_region_review"
    ON waseet_region_review FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role all on waseet_region_review" ON waseet_region_review;
CREATE POLICY "Service role all on waseet_region_review"
    ON waseet_region_review FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON waseet_region_review FROM anon, authenticated;
REVOKE SELECT ON waseet_region_review FROM anon;

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
        HAVING count(*) >= 2
    ),
    prefix AS (
        SELECT f.city_id, f.toks[1] AS key, count(*) AS n
          FROM folded f
         WHERE f.dash_head IS NULL
           AND array_length(f.toks, 1) >= 2
           AND char_length(f.toks[1]) >= 3
           AND waseet_kind_of_token(f.toks[1]) IS NULL
           AND f.toks[1] <> ALL (ARRAY['مدينه','قضاء','قطاع','مركز','دوره','محافظه'])
         GROUP BY 1, 2
        HAVING count(*) >= 8
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
           AND (r.name_search = d.name_search OR r.name_search LIKE d.name_search || ' %'));

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
        SELECT id, min(id) OVER (PARTITION BY city_id, name_key_sorted) AS canonical
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

CREATE OR REPLACE FUNCTION waseet_refresh_region_review(p_threshold REAL DEFAULT 0.82)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pairs INT;
BEGIN
    DELETE FROM waseet_region_review;

    INSERT INTO waseet_region_review (a_id, b_id, city_id, similarity)
    SELECT a.id, b.id, a.city_id, extensions.similarity(a.name_search, b.name_search)
      FROM waseet_regions a
      JOIN waseet_regions b
        ON b.city_id = a.city_id
       AND b.id > a.id
       AND a.canonical_id = a.id
       AND b.canonical_id = b.id
       AND extensions.similarity(a.name_search, b.name_search) >= p_threshold
     WHERE regexp_replace(a.name_search, '[0-9٠-٩]+', '#', 'g')
        IS DISTINCT FROM regexp_replace(b.name_search, '[0-9٠-٩]+', '#', 'g')
        OR a.name_search = b.name_search;

    GET DIAGNOSTICS v_pairs = ROW_COUNT;
    RETURN v_pairs;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_region_review(REAL) FROM PUBLIC, anon, authenticated;

SELECT waseet_refresh_canonical_regions();
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
    'Cleaned Al-Waseet delivery destinations, governorate -> district -> region. Filter on is_canonical AND NOT is_suspect for a picker; query waseet_regions directly to resolve any historical id.';;
