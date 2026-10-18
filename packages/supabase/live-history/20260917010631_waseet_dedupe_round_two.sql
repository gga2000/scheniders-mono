CREATE OR REPLACE FUNCTION waseet_dedupe_key(p_name_key TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT replace(
           waseet_sort_tokens(
             waseet_strip_article(
               translate(p_name_key, '٠١٢٣٤٥٦٧٨٩', '0123456789')
             )
           ),
           ' ', ''
         );
$$;

ALTER TABLE waseet_region_review
    ADD COLUMN IF NOT EXISTS reason TEXT NOT NULL DEFAULT 'similar_spelling';

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
                              waseet_dedupe_key(COALESCE(name_search_split, name_search))
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

    INSERT INTO waseet_region_review (a_id, b_id, city_id, similarity, reason)
    SELECT a.id, b.id, a.city_id,
           extensions.similarity(a.name_search, b.name_search),
           'similar_spelling'
      FROM waseet_regions a
      JOIN waseet_regions b
        ON b.city_id = a.city_id AND b.id > a.id
       AND a.canonical_id = a.id AND b.canonical_id = b.id
       AND extensions.similarity(a.name_search, b.name_search) >= p_threshold
     WHERE regexp_replace(a.name_search, '[0-9٠-٩]+', '#', 'g')
        IS DISTINCT FROM regexp_replace(b.name_search, '[0-9٠-٩]+', '#', 'g')
        OR a.name_search = b.name_search;

    INSERT INTO waseet_region_review (a_id, b_id, city_id, similarity, reason)
    SELECT a_id, b_id, city_id, 1.0, 'type_word_only'
      FROM (
        SELECT a.id AS a_id, b.id AS b_id, a.city_id
          FROM (SELECT id, city_id,
                       btrim(regexp_replace(regexp_replace(
                         waseet_strip_article(COALESCE(name_search_split, name_search)),
                         '(^|\s)(حي|محله|منطقه|ناحيه|قريه|مركز|مدينه|قضاء)(\s|$)', ' ', 'g'),
                         '\s+', ' ', 'g')) AS core
                  FROM waseet_regions WHERE canonical_id = id) a
          JOIN (SELECT id, city_id,
                       btrim(regexp_replace(regexp_replace(
                         waseet_strip_article(COALESCE(name_search_split, name_search)),
                         '(^|\s)(حي|محله|منطقه|ناحيه|قريه|مركز|مدينه|قضاء)(\s|$)', ' ', 'g'),
                         '\s+', ' ', 'g')) AS core
                  FROM waseet_regions WHERE canonical_id = id) b
            ON b.city_id = a.city_id AND b.id > a.id AND b.core = a.core
         WHERE a.core <> ''
      ) t
     WHERE NOT EXISTS (SELECT 1 FROM waseet_region_review w
                        WHERE w.a_id = t.a_id AND w.b_id = t.b_id);

    SELECT count(*) INTO v_pairs FROM waseet_region_review;
    RETURN v_pairs;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_region_review(REAL) FROM PUBLIC, anon, authenticated;

SELECT waseet_refresh_canonical_regions();
SELECT waseet_refresh_region_review();;
