-- The first resolver scanned all 6,590 aliases per call with LIKE and
-- similarity(), which is fine for one lookup and hopeless for a backfill.
-- Two changes make it index-backed: a stored article-stripped key to join on,
-- and phrase candidates generated from the INPUT so the alias side is an
-- equality lookup rather than a scan.
ALTER TABLE iraq_location_aliases
    ADD COLUMN IF NOT EXISTS alias_key TEXT
    GENERATED ALWAYS AS (waseet_strip_article(waseet_search_key(alias_ar))) STORED;

CREATE INDEX IF NOT EXISTS idx_iraq_aliases_key ON iraq_location_aliases(alias_key);
CREATE INDEX IF NOT EXISTS idx_iraq_aliases_key_trgm
    ON iraq_location_aliases USING gin (alias_key extensions.gin_trgm_ops);

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
    v_key  TEXT;
    v_toks TEXT[];
    v_n    INT;
BEGIN
    v_key := waseet_strip_article(waseet_search_key(COALESCE(p_text, '')));
    IF v_key = '' OR p_governorate_code IS NULL THEN
        RETURN;
    END IF;

    v_toks := string_to_array(v_key, ' ');
    v_n := COALESCE(array_length(v_toks, 1), 0);

    -- 1 & 2 together: every phrase of 1-5 words in the input, matched against
    -- alias keys by equality. The longest matching phrase wins, which is both
    -- the exact case (phrase = whole input) and the contained case.
    RETURN QUERY
    WITH phrase AS (
        SELECT array_to_string(v_toks[i:j], ' ') AS p, (j - i + 1) AS words
          FROM generate_series(1, v_n) AS i,
               generate_series(1, v_n) AS j
         WHERE j >= i AND (j - i + 1) <= 5
    ),
    hit AS (
        SELECT l.id, l.name_ar, a.alias_ar, ph.words,
               char_length(ph.p) AS chars,
               (ph.words = v_n) AS whole
          FROM phrase ph
          JOIN iraq_location_aliases a ON a.alias_key = ph.p
          JOIN iraq_locations l ON l.id = a.location_id
         WHERE l.governorate_code = p_governorate_code
           AND l.is_active
           AND char_length(ph.p) >= 4
    )
    SELECT h.id, h.name_ar, h.alias_ar,
           CASE WHEN h.whole THEN 'exact' ELSE 'contains' END,
           LEAST(1.0, h.chars::REAL / GREATEST(char_length(v_key), 1))::REAL
      FROM hit h
     ORDER BY h.whole DESC, h.chars DESC, h.id
     LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- 3. misspelling: the % operator uses the trigram index, unlike similarity()
    RETURN QUERY
    SELECT l.id, l.name_ar, a.alias_ar, 'fuzzy'::TEXT,
           extensions.similarity(a.alias_key, v_key)
      FROM iraq_location_aliases a
      JOIN iraq_locations l ON l.id = a.location_id
     WHERE l.governorate_code = p_governorate_code
       AND l.is_active
       AND a.alias_key % v_key
       AND extensions.similarity(a.alias_key, v_key) >= p_min_similarity
     ORDER BY extensions.similarity(a.alias_key, v_key) DESC, l.id
     LIMIT 1;
END;
$$;

GRANT EXECUTE ON FUNCTION iraq_resolve_location(TEXT, TEXT, REAL) TO authenticated, service_role;;
