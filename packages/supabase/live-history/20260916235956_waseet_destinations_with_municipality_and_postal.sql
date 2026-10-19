DROP VIEW IF EXISTS waseet_destinations;

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
    'Cleaned Al-Waseet delivery destinations: governorate -> district -> region, plus the official postal code and (where a source places it) the Baghdad municipality. Filter on is_canonical AND NOT is_suspect for a picker.';;
