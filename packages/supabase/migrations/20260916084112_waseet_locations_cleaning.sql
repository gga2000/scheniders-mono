CREATE OR REPLACE FUNCTION waseet_clean_name(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT btrim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          translate(
            replace(p_name, E' ', ' '),
            E'​‌‍‎‏ـ', ''
          ),
          '\s+', ' ', 'g'
        ),
        '(\S+)( \1)+', '\1', 'g'
      ),
      '\s*-\s*', ' - ', 'g'
    )
  );
$$;

CREATE OR REPLACE FUNCTION waseet_search_key(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT btrim(regexp_replace(
    lower(
      regexp_replace(
        translate(
          waseet_clean_name(p_name),
          E'أإآٱىةؤئًٌٍَُِّْٰٕٓٔ',
          'اااايهءء'
        ),
        E'[^[:alnum:][:space:]؀-ۿ]', ' ', 'g'
      )
    ),
    '\s+', ' ', 'g'
  ));
$$;

CREATE OR REPLACE FUNCTION waseet_place_kind(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT CASE split_part(waseet_search_key(p_name), ' ', 1)
    WHEN 'حي' THEN 'neighbourhood'
    WHEN 'محله' THEN 'neighbourhood'
    WHEN 'شارع' THEN 'street'
    WHEN 'مجمع' THEN 'complex'
    WHEN 'شقق' THEN 'complex'
    WHEN 'عماره' THEN 'complex'
    WHEN 'دور' THEN 'complex'
    WHEN 'قريه' THEN 'village'
    WHEN 'ناحيه' THEN 'subdistrict'
    WHEN 'منطقه' THEN 'subdistrict'
    WHEN 'سوق' THEN 'market'
    WHEN 'مول' THEN 'market'
    WHEN 'علوه' THEN 'market'
    WHEN 'مستشفي' THEN 'hospital'
    WHEN 'مستوصف' THEN 'hospital'
    WHEN 'جامعه' THEN 'education'
    WHEN 'كليه' THEN 'education'
    WHEN 'مدرسه' THEN 'education'
    WHEN 'معهد' THEN 'education'
    WHEN 'فندق' THEN 'venue'
    WHEN 'مطعم' THEN 'venue'
    WHEN 'مقهي' THEN 'venue'
    WHEN 'جامع' THEN 'religious'
    WHEN 'مقام' THEN 'religious'
    WHEN 'حسينيه' THEN 'religious'
    WHEN 'كنيسه' THEN 'religious'
    WHEN 'دير' THEN 'religious'
    WHEN 'جسر' THEN 'transit'
    WHEN 'طريق' THEN 'transit'
    WHEN 'ساحه' THEN 'transit'
    WHEN 'كراج' THEN 'transit'
    WHEN 'بوابه' THEN 'transit'
    WHEN 'سيطره' THEN 'transit'
    WHEN 'مفرق' THEN 'transit'
    WHEN 'دوار' THEN 'transit'
    WHEN 'معمل' THEN 'industrial'
    WHEN 'مصنع' THEN 'industrial'
    ELSE 'area'
  END;
$$;

CREATE OR REPLACE FUNCTION waseet_district(p_name TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT NULLIF(
    CASE WHEN waseet_clean_name(p_name) LIKE '% - %'
         THEN split_part(waseet_clean_name(p_name), ' - ', 1)
    END, ''
  );
$$;

ALTER TABLE waseet_regions
    ADD COLUMN IF NOT EXISTS name_clean    TEXT GENERATED ALWAYS AS (waseet_clean_name(name_ar)) STORED,
    ADD COLUMN IF NOT EXISTS name_search   TEXT GENERATED ALWAYS AS (waseet_search_key(name_ar)) STORED,
    ADD COLUMN IF NOT EXISTS place_kind    TEXT GENERATED ALWAYS AS (waseet_place_kind(name_ar)) STORED,
    ADD COLUMN IF NOT EXISTS district_name TEXT GENERATED ALWAYS AS (waseet_district(name_ar)) STORED,
    ADD COLUMN IF NOT EXISTS is_suspect    BOOLEAN GENERATED ALWAYS AS (
        char_length(waseet_search_key(name_ar)) <= 3
        OR waseet_search_key(name_ar) !~ E'[؀-ۿ]'
    ) STORED;

ALTER TABLE waseet_regions
    ADD COLUMN IF NOT EXISTS canonical_id INT REFERENCES waseet_regions(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION waseet_refresh_canonical_regions()
RETURNS INT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
    v_duplicates INT;
BEGIN
    WITH ranked AS (
        SELECT id, min(id) OVER (PARTITION BY city_id, name_search) AS canonical
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

SELECT waseet_refresh_canonical_regions();

DROP INDEX IF EXISTS idx_waseet_regions_name_trgm;
CREATE INDEX IF NOT EXISTS idx_waseet_regions_search_trgm
    ON waseet_regions USING gin (name_search extensions.gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_waseet_regions_city_search
    ON waseet_regions (city_id, name_search);
CREATE INDEX IF NOT EXISTS idx_waseet_regions_canonical
    ON waseet_regions (canonical_id);
CREATE INDEX IF NOT EXISTS idx_waseet_regions_district
    ON waseet_regions (city_id, district_name) WHERE district_name IS NOT NULL;

CREATE OR REPLACE VIEW waseet_destinations WITH (security_invoker = true) AS
SELECT r.id AS region_id,
       r.name_clean AS region_name,
       r.name_search AS region_search,
       r.place_kind,
       r.district_name,
       c.id AS city_id,
       c.name_ar AS city_name,
       c.governorate_code,
       r.canonical_id,
       (r.canonical_id = r.id) AS is_canonical,
       r.is_suspect
  FROM waseet_regions r
  JOIN waseet_cities c ON c.id = r.city_id
 WHERE r.is_active AND c.is_active;

COMMENT ON VIEW waseet_destinations IS
    'Cleaned Al-Waseet delivery destinations. Filter on is_canonical AND NOT is_suspect for a picker; query waseet_regions directly to resolve any historical id.';
