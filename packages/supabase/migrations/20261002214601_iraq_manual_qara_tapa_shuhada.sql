-- "قرة تبة حي الشهداء" is the Shuhada quarter of قرة تبة, which is in قضاء كفري. The own-name
-- ranking sends it to a derived الشهداء cluster instead, and the substring guard cannot catch it
-- because "شهداء" is not contained in "قره تبه".
--
-- Correcting the note in 20261003xxxxxx_iraq_refresh_districts_prefer_own_name_over_length: that
-- migration claimed this row would be caught by iraq_flag_ambiguous_placements. It is not —
-- that function only reports ties, and this is a clean single winner. Verified: the row came out
-- as review_status 'ok', i.e. silently wrong, which is the thing I said it would not be.
--
-- Fixed through the override path the schema already provides: district_is_manual puts a human
-- decision above every derived rule and survives iraq_refresh_location_districts, which only
-- recomputes rows where district_is_manual is false.
UPDATE iraq_locations l
   SET district_id = d.id,
       district_is_manual = true,
       district_source = 'manual',
       updated_at = now()
  FROM iraq_districts d
 WHERE d.governorate_code = 'DYL'
   AND d.name_ar = 'كفري'
   AND l.governorate_code = 'DYL'
   AND l.name_ar = 'قرة تبة حي الشهداء';
