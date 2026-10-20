-- A name typed as "الصويرة -" or "- اخرى" keeps a separator with nothing on
-- the other side of it. The district split already ignores these, but they
-- still show in the displayed name, so 31 rows read as if something were
-- missing. An unmatched ")" is the same artifact.
CREATE OR REPLACE FUNCTION waseet_clean_name(p_name TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
  SELECT btrim(
    -- drop a separator left dangling at either end, and a ")" with no "("
    regexp_replace(
      regexp_replace(
        regexp_replace(
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
          ),
          '^\s*[-–]\s*|\s*[-–]\s*$', '', 'g'
        ),
        '\(\s*\)', '', 'g'
      ),
      '\s+', ' ', 'g'
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

CREATE VIEW waseet_destinations
WITH (security_invoker = true)
AS
SELECT r.id                                          AS region_id,
       COALESCE(r.name_display, r.name_clean)        AS region_name,
       COALESCE(r.name_search_split, r.name_search)  AS region_search,
       r.name_clean                                  AS region_name_unsplit,
       r.place_kind,
       r.postal_code,
       r.municipality_ar,
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
    'Cleaned Al-Waseet delivery destinations: governorate -> district -> region, plus the official postal code and (where a source places it) the Baghdad municipality. Filter on is_canonical AND NOT is_suspect for a picker.';
