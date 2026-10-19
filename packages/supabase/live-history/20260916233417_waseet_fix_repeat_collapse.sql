CREATE OR REPLACE FUNCTION waseet_collapse_repeats(p_text TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT string_agg(z.tok, ' ' ORDER BY z.ord)
      FROM (
        SELECT t.tok, t.ord, lag(t.tok) OVER (ORDER BY t.ord) AS prev
          FROM unnest(string_to_array(p_text, ' ')) WITH ORDINALITY AS t(tok, ord)
      ) z
     WHERE z.tok IS DISTINCT FROM z.prev
  ), '');
$$;

CREATE OR REPLACE FUNCTION waseet_clean_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            waseet_collapse_repeats(
              regexp_replace(
                translate(
                  replace(p_name, E'\u00A0', ' '),
                  E'\u200B\u200C\u200D\u200E\u200F\u0640', ''
                ),
                '\s+', ' ', 'g'
              )
            ),
            E'([0-9\u0660-\u0669])\\s*-\\s*([0-9\u0660-\u0669])', E'\\1\u2013\\2', 'g'
          ),
          '\s*-\s*', ' - ', 'g'
        ),
        '\s*\(\s*', ' (', 'g'
      ),
      '\s*\)', ')', 'g'
    )
  );
$$;

DROP VIEW IF EXISTS waseet_destinations;

ALTER TABLE waseet_regions
    DROP COLUMN IF EXISTS name_clean,
    DROP COLUMN IF EXISTS name_search,
    DROP COLUMN IF EXISTS place_kind,
    DROP COLUMN IF EXISTS district_name,
    DROP COLUMN IF EXISTS is_suspect,
    DROP COLUMN IF EXISTS name_key_sorted;

ALTER TABLE waseet_regions
    ADD COLUMN name_clean      TEXT GENERATED ALWAYS AS (waseet_clean_name(name_ar)) STORED,
    ADD COLUMN name_search     TEXT GENERATED ALWAYS AS (waseet_search_key(name_ar)) STORED,
    ADD COLUMN place_kind      TEXT GENERATED ALWAYS AS (waseet_place_kind(name_ar)) STORED,
    ADD COLUMN district_name   TEXT GENERATED ALWAYS AS (waseet_district(name_ar)) STORED,
    ADD COLUMN name_key_sorted TEXT GENERATED ALWAYS AS (waseet_name_key_sorted(name_ar)) STORED,
    ADD COLUMN is_suspect      BOOLEAN GENERATED ALWAYS AS (
        char_length(waseet_search_key(name_ar)) <= 3
        OR waseet_search_key(name_ar) !~ E'[\u0600-\u06FF]'
    ) STORED;

CREATE INDEX IF NOT EXISTS idx_waseet_regions_search_trgm
    ON waseet_regions USING gin (name_search extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_waseet_regions_city_search
    ON waseet_regions (city_id, name_search);
CREATE INDEX IF NOT EXISTS idx_waseet_regions_district
    ON waseet_regions (city_id, district_name) WHERE district_name IS NOT NULL;

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

    WITH paired AS (
        SELECT r.id, r.city_id, s.ord, s.tok AS stok, c.tok AS ctok
          FROM waseet_regions r
          JOIN LATERAL unnest(string_to_array(r.name_search, ' ')) WITH ORDINALITY AS s(tok, ord)
            ON true
          JOIN LATERAL unnest(string_to_array(r.name_clean, ' ')) WITH ORDINALITY AS c(tok, ord)
            ON c.ord = s.ord
         WHERE array_length(string_to_array(r.name_search, ' '), 1)
             = array_length(string_to_array(r.name_clean, ' '), 1)
    ),
    hit AS (
        SELECT DISTINCT ON (p.id, p.ord)
               p.id, p.ord, p.stok, p.ctok,
               d.name_search AS base,
               substr(p.stok, char_length(d.name_search) + 1) AS remainder
          FROM paired p
          JOIN waseet_districts d ON d.city_id = p.city_id
         WHERE p.stok LIKE d.name_search || '%'
           AND p.stok <> d.name_search
           AND char_length(substr(p.stok, char_length(d.name_search) + 1)) >= 3
           AND substr(p.stok, char_length(d.name_search) + 1) !~ '[0-9\u0660-\u0669]'
           AND substr(p.stok, char_length(d.name_search) + 1)
               <> ALL (ARRAY['يون','يات','يين','تين','ايه','يته','يها','وين'])
           AND waseet_search_key(substr(p.ctok, 1, char_length(d.name_search)))
               = d.name_search
         ORDER BY p.id, p.ord, char_length(d.name_search) DESC
    ),
    rebuilt AS (
        SELECT p.id,
               string_agg(CASE WHEN h.id IS NULL THEN p.stok
                               ELSE h.base || ' ' || h.remainder END, ' ' ORDER BY p.ord) AS skey,
               string_agg(CASE WHEN h.id IS NULL THEN p.ctok
                               ELSE substr(p.ctok, 1, char_length(h.base)) || ' ' ||
                                    substr(p.ctok, char_length(h.base) + 1) END,
                          ' ' ORDER BY p.ord) AS ctext
          FROM paired p
          LEFT JOIN hit h ON h.id = p.id AND h.ord = p.ord
         GROUP BY p.id
        HAVING count(*) FILTER (WHERE h.id IS NOT NULL) > 0
    )
    UPDATE waseet_regions r
       SET name_search_split = waseet_collapse_repeats(b.skey),
           name_display      = waseet_collapse_repeats(b.ctext)
      FROM rebuilt b
     WHERE r.id = b.id;

    GET DIAGNOSTICS v_split = ROW_COUNT;
    RETURN v_split;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_split_names() FROM PUBLIC, anon, authenticated;

SELECT * FROM waseet_refresh_districts();
SELECT waseet_refresh_split_names();
SELECT * FROM waseet_refresh_districts();
SELECT waseet_refresh_canonical_regions();
SELECT waseet_refresh_region_review();

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
    'Cleaned Al-Waseet delivery destinations, governorate -> district -> region. Filter on is_canonical AND NOT is_suspect for a picker; query waseet_regions directly to resolve any historical id.';;
