-- Reproducibility fix, a no-op against the live database.
--
-- iraq_locations.postal_code is set by the seed (20260917015554) from
-- waseet_regions.postal_code. In the live database the 348 official codes had been
-- loaded by hand before the seed ran, so 152 locations picked up a code. In the repo the
-- codes only load at 20260917180000 — after the seed — so rebuilding from the migrations
-- would leave every location with a NULL code and silently lose those 152.
--
-- This re-derives them down the same path the seed used (carrier ref -> waseet_regions),
-- which was verified to reproduce exactly the same 152 rows with identical values and
-- zero differences. Existing codes are left alone, so a hand-set value is never
-- overwritten.
UPDATE iraq_locations l
   SET postal_code = d.pc, updated_at = now()
  FROM (
    SELECT cr.location_id AS id, max(r.postal_code) AS pc
      FROM iraq_location_carrier_refs cr
      JOIN waseet_regions r ON r.id::TEXT = cr.external_id
     WHERE cr.carrier = 'al_waseet'
       AND r.postal_code IS NOT NULL
     GROUP BY cr.location_id
  ) d
 WHERE l.id = d.id
   AND l.postal_code IS NULL;;
