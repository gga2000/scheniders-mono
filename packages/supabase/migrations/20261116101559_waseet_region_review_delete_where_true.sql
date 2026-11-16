-- B8: the area rebuild could never finish through the Supabase API.
--
-- API sessions load pg-safeupdate, which refuses an UPDATE or DELETE without
-- a WHERE, even inside a function. waseet_refresh_region_review empties its
-- queue with a bare DELETE, so waseet_refresh_all (and the old step-by-step
-- calls before it) failed there with "DELETE requires a WHERE clause" and
-- rolled the whole rebuild back. It now says WHERE true; nothing else changes.
CREATE OR REPLACE FUNCTION waseet_refresh_region_review(p_threshold REAL DEFAULT 0.82)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pairs INT;
BEGIN
    DELETE FROM waseet_region_review WHERE true;

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
