-- =============================================================
-- Resolve a free-text Iraqi address to a location.
--
-- Not wired to orders yet (that is a later decision) — this is the function
-- and its confidence contract, testable on its own.
--
-- Three passes, best first, each one narrower than the last:
--   exact   — the whole text is a known name or alias
--   contains— a known alias appears in the text as a whole token run; the
--             LONGEST such alias wins, so "حي الجهاد" beats "الجهاد"
--   fuzzy   — trigram similarity above a threshold, for misspellings
--
-- Everything is scoped to one governorate: 167 names exist in more than one,
-- so an unscoped match would be a coin toss.
-- =============================================================

CREATE OR REPLACE FUNCTION iraq_resolve_location(
    p_text             TEXT,
    p_governorate_code TEXT,
    p_min_similarity   REAL DEFAULT 0.55
)
RETURNS TABLE (
    location_id   INT,
    location_name TEXT,
    matched_alias TEXT,
    confidence    TEXT,
    score         REAL
)
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_key TEXT;
BEGIN
    v_key := waseet_strip_article(waseet_search_key(COALESCE(p_text, '')));
    IF v_key = '' OR p_governorate_code IS NULL THEN
        RETURN;
    END IF;

    -- 1. the whole text IS the place
    RETURN QUERY
    SELECT l.id, l.name_ar, a.alias_ar, 'exact'::TEXT, 1.0::REAL
      FROM iraq_location_aliases a
      JOIN iraq_locations l ON l.id = a.location_id
     WHERE l.governorate_code = p_governorate_code
       AND l.is_active
       AND waseet_strip_article(a.alias_search) = v_key
     ORDER BY l.id
     LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- 2. a known place appears inside the text; longest alias wins
    RETURN QUERY
    SELECT l.id, l.name_ar, a.alias_ar, 'contains'::TEXT,
           (char_length(waseet_strip_article(a.alias_search))::REAL
              / GREATEST(char_length(v_key), 1))::REAL
      FROM iraq_location_aliases a
      JOIN iraq_locations l ON l.id = a.location_id
     WHERE l.governorate_code = p_governorate_code
       AND l.is_active
       AND char_length(waseet_strip_article(a.alias_search)) >= 4
       AND (v_key = waseet_strip_article(a.alias_search)
            OR v_key LIKE waseet_strip_article(a.alias_search) || ' %'
            OR v_key LIKE '% ' || waseet_strip_article(a.alias_search)
            OR v_key LIKE '% ' || waseet_strip_article(a.alias_search) || ' %')
     ORDER BY char_length(waseet_strip_article(a.alias_search)) DESC, l.id
     LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- 3. close enough to be a misspelling
    RETURN QUERY
    SELECT l.id, l.name_ar, a.alias_ar, 'fuzzy'::TEXT,
           extensions.similarity(a.alias_search, v_key)
      FROM iraq_location_aliases a
      JOIN iraq_locations l ON l.id = a.location_id
     WHERE l.governorate_code = p_governorate_code
       AND l.is_active
       AND extensions.similarity(a.alias_search, v_key) >= p_min_similarity
     ORDER BY extensions.similarity(a.alias_search, v_key) DESC, l.id
     LIMIT 1;
END;
$$;

COMMENT ON FUNCTION iraq_resolve_location(TEXT, TEXT, REAL) IS
    'Free-text address -> location, scoped to one governorate. Returns at most one row with a confidence of exact | contains | fuzzy, or nothing.';

GRANT EXECUTE ON FUNCTION iraq_resolve_location(TEXT, TEXT, REAL) TO authenticated, service_role;
