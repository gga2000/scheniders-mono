-- Measured on 4,641 genuine order addresses (templated demo rows excluded), iraq_resolve_location
-- answered 76.6%. Of the 1,084 misses, 297 (27.4%) name a قضاء or بلدية rather than a specific
-- area — "قضاء هيت", "أبي الخصيب", "عنه", "المجر الكبير", "شط العرب". Returning nothing for those
-- is strictly worse than returning the district: a qadha is a real, usable answer and it is
-- exactly what the customer wrote.
--
-- This is a NEW function rather than a replacement, because the extra return columns would
-- require dropping iraq_resolve_location and that is not worth doing to a granted function while
-- anything might still reference it. iraq_resolve_location stays valid and unchanged;
-- iraq_resolve_address supersedes it and is the one to call.
--
-- Pass order: location exact -> location contains -> location fuzzy -> district. The district
-- pass runs last, so it can only add coverage and can never downgrade an existing answer.
CREATE OR REPLACE FUNCTION iraq_resolve_address(
    p_text             TEXT,
    p_governorate_code TEXT,
    p_min_similarity   REAL DEFAULT 0.55
)
RETURNS TABLE (
    location_id   INT,
    location_name TEXT,
    district_id   INT,
    district_name TEXT,
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

    -- 1 & 2: every phrase of 1-5 words in the input against alias keys by equality.
    -- The longest matching phrase wins: exact when it spans the whole input, else contained.
    RETURN QUERY
    WITH phrase AS (
        SELECT array_to_string(v_toks[i:j], ' ') AS p, (j - i + 1) AS words
          FROM generate_series(1, v_n) AS i,
               generate_series(1, v_n) AS j
         WHERE j >= i AND (j - i + 1) <= 5
    ),
    hit AS (
        SELECT l.id, l.name_ar, l.district_id AS d_id, a.alias_ar, ph.words,
               char_length(ph.p) AS chars,
               (ph.words = v_n) AS whole
          FROM phrase ph
          JOIN iraq_location_aliases a ON a.alias_key = ph.p
          JOIN iraq_locations l ON l.id = a.location_id
         WHERE l.governorate_code = p_governorate_code
           AND l.is_active
           AND char_length(ph.p) >= 4
    )
    SELECT h.id, h.name_ar, h.d_id,
           (SELECT d.name_ar FROM iraq_districts d WHERE d.id = h.d_id),
           h.alias_ar,
           CASE WHEN h.whole THEN 'exact' ELSE 'contains' END,
           LEAST(1.0, h.chars::REAL / GREATEST(char_length(v_key), 1))::REAL
      FROM hit h
     ORDER BY h.whole DESC, h.chars DESC, h.id
     LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- 3. misspelling: the % operator uses the trigram index, unlike similarity()
    RETURN QUERY
    SELECT l.id, l.name_ar, l.district_id,
           (SELECT d.name_ar FROM iraq_districts d WHERE d.id = l.district_id),
           a.alias_ar, 'fuzzy'::TEXT,
           extensions.similarity(a.alias_key, v_key)
      FROM iraq_location_aliases a
      JOIN iraq_locations l ON l.id = a.location_id
     WHERE l.governorate_code = p_governorate_code
       AND l.is_active
       AND a.alias_key OPERATOR(extensions.%) v_key
       AND extensions.similarity(a.alias_key, v_key) >= p_min_similarity
     ORDER BY extensions.similarity(a.alias_key, v_key) DESC, l.id
     LIMIT 1;
    IF FOUND THEN RETURN; END IF;

    -- 4. no area matched, but the text names a district. A sourced qadha or municipality
    --    outranks a derived cluster of the same length, as in the placement rules.
    RETURN QUERY
    WITH phrase AS (
        SELECT array_to_string(v_toks[i:j], ' ') AS p
          FROM generate_series(1, v_n) AS i,
               generate_series(1, v_n) AS j
         WHERE j >= i AND (j - i + 1) <= 5
    )
    SELECT NULL::INT, NULL::TEXT, d.id, d.name_ar, d.name_ar, 'district'::TEXT,
           LEAST(1.0, char_length(ph.p)::REAL / GREATEST(char_length(v_key), 1))::REAL
      FROM phrase ph
      JOIN iraq_districts d
        ON d.governorate_code = p_governorate_code
       AND iraq_district_identity_key(d.name_ar) = ph.p
     WHERE char_length(ph.p) >= 3
     ORDER BY char_length(ph.p) DESC, (d.kind <> 'area_cluster') DESC, d.id
     LIMIT 1;
END;
$$;

COMMENT ON FUNCTION iraq_resolve_address(TEXT, TEXT, REAL) IS
    'Free-text address -> location, scoped to one governorate. At most one row. confidence is exact | contains | fuzzy when an area matched (district_id is that area''s parent), or district when only a قضاء/بلدية could be identified, in which case location_id is NULL. Supersedes iraq_resolve_location.';

REVOKE EXECUTE ON FUNCTION iraq_resolve_address(TEXT, TEXT, REAL) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION iraq_resolve_address(TEXT, TEXT, REAL) TO authenticated, service_role;
