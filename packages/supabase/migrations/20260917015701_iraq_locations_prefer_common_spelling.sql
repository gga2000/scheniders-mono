-- The canonical row was chosen by lowest id, which is arbitrary as a NAME:
-- "رفاعي" won over "الرفاعي" purely because it was entered first. For display
-- the right answer is the spelling Al-Waseet used most often, with the longer
-- form breaking a tie — that keeps the definite article rather than dropping it.
WITH ranked AS (
    SELECT cr.location_id,
           btrim(cr.external_name) AS spelling,
           count(*) AS n,
           row_number() OVER (
             PARTITION BY cr.location_id
             ORDER BY count(*) DESC, char_length(btrim(cr.external_name)) DESC, btrim(cr.external_name)
           ) AS rn
      FROM iraq_location_carrier_refs cr
     WHERE cr.carrier = 'al_waseet'
       AND btrim(COALESCE(cr.external_name, '')) <> ''
     GROUP BY cr.location_id, btrim(cr.external_name)
),
best AS (
    SELECT location_id, spelling FROM ranked WHERE rn = 1
)
UPDATE iraq_locations l
   SET name_ar = waseet_clean_name(b.spelling),
       updated_at = now()
  FROM best b
 WHERE l.id = b.location_id
   AND waseet_clean_name(b.spelling) <> l.name_ar
   -- never rename to something that would collide with a sibling in the same governorate
   AND NOT EXISTS (
        SELECT 1 FROM iraq_locations o
         WHERE o.governorate_code = l.governorate_code
           AND o.id <> l.id
           AND o.name_ar = waseet_clean_name(b.spelling));

-- the old spelling stays reachable as an alias
INSERT INTO iraq_location_aliases (location_id, alias_ar, source)
SELECT l.id, l.name_ar, 'al_waseet'
  FROM iraq_locations l
ON CONFLICT (location_id, alias_ar) DO NOTHING;
