-- Carrier refs: EVERY Al-Waseet id, duplicates and test rows included, pointed
-- at the location its canonical row became. This is what makes collapsing the
-- duplicates lossless — a historical id still resolves to a real place.
INSERT INTO iraq_location_carrier_refs (carrier, external_id, location_id, external_name, is_preferred)
SELECT 'al_waseet', r.id::TEXT, l.id, r.name_ar, (r.canonical_id = r.id)
  FROM waseet_regions r
  JOIN waseet_cities c ON c.id = r.city_id
  JOIN waseet_regions canon ON canon.id = r.canonical_id
  JOIN iraq_locations l
    ON l.governorate_code = c.governorate_code
   AND l.name_ar = COALESCE(canon.name_display, canon.name_clean)
 WHERE NOT canon.is_suspect
ON CONFLICT (carrier, external_id) DO NOTHING;

-- Aliases. The primary spelling first...
INSERT INTO iraq_location_aliases (location_id, alias_ar, source)
SELECT l.id, l.name_ar, 'al_waseet'
  FROM iraq_locations l
ON CONFLICT (location_id, alias_ar) DO NOTHING;

-- ...then every raw Al-Waseet spelling that mapped to it, which is where the
-- collapsed duplicate rows earn their keep: "رفاعي" and "الرفاعي" both now
-- point at one place instead of being two destinations.
INSERT INTO iraq_location_aliases (location_id, alias_ar, source)
SELECT DISTINCT cr.location_id, btrim(cr.external_name), 'duplicate'
  FROM iraq_location_carrier_refs cr
 WHERE cr.carrier = 'al_waseet'
   AND btrim(COALESCE(cr.external_name, '')) <> ''
ON CONFLICT (location_id, alias_ar) DO NOTHING;

-- the cleaned form too, when it differs from the raw one
INSERT INTO iraq_location_aliases (location_id, alias_ar, source)
SELECT DISTINCT cr.location_id, r.name_clean, 'duplicate'
  FROM iraq_location_carrier_refs cr
  JOIN waseet_regions r ON r.id::TEXT = cr.external_id
 WHERE cr.carrier = 'al_waseet'
   AND r.name_clean <> r.name_ar
ON CONFLICT (location_id, alias_ar) DO NOTHING;

-- the official postal spelling, where a code matched
INSERT INTO iraq_location_aliases (location_id, alias_ar, source)
SELECT DISTINCT l.id, p.name_ar, 'postal'
  FROM iraq_locations l
  JOIN iraq_postal_codes p ON p.code = l.postal_code
 WHERE p.name_ar <> l.name_ar
ON CONFLICT (location_id, alias_ar) DO NOTHING;

-- Review pairs carried over against the new ids.
INSERT INTO iraq_location_reviews (a_location_id, b_location_id, reason, similarity)
SELECT LEAST(la.id, lb.id), GREATEST(la.id, lb.id), w.reason, w.similarity
  FROM waseet_region_review w
  JOIN iraq_location_carrier_refs ca ON ca.carrier = 'al_waseet' AND ca.external_id = w.a_id::TEXT
  JOIN iraq_location_carrier_refs cb ON cb.carrier = 'al_waseet' AND cb.external_id = w.b_id::TEXT
  JOIN iraq_locations la ON la.id = ca.location_id
  JOIN iraq_locations lb ON lb.id = cb.location_id
 WHERE la.id <> lb.id
ON CONFLICT (a_location_id, b_location_id) DO NOTHING;
