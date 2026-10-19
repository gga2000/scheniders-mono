-- =============================================================
-- Manual parent assignments.
--
-- The derivation places ~71% of Baghdad; the rest needs someone who knows the
-- city. A manual move has to outrank every automatic rule AND survive the
-- weekly sync, which wipes district_id and municipality_ar and recomputes them
-- from scratch — so overrides live in their own table and are re-applied as
-- the last step of every refresh.
--
-- The target is stored by NAME, not by district id: derived district ids are
-- rebuilt on each run, so a name is the stable way to say "this belongs there".
-- =============================================================

CREATE TABLE IF NOT EXISTS waseet_region_overrides (
    region_id   INT PRIMARY KEY REFERENCES waseet_regions(id) ON DELETE CASCADE,
    parent_kind TEXT NOT NULL CHECK (parent_kind IN ('district','municipality','none')),
    parent_ar   TEXT,
    note        TEXT,
    assigned_by TEXT,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- 'none' means "deliberately has no parent", which is different from
    -- "not looked at yet" and must not carry a name.
    CONSTRAINT waseet_region_overrides_parent_shape
      CHECK ((parent_kind = 'none' AND parent_ar IS NULL)
          OR (parent_kind <> 'none' AND parent_ar IS NOT NULL))
);

ALTER TABLE waseet_region_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read on waseet_region_overrides" ON waseet_region_overrides;
CREATE POLICY "Authenticated read on waseet_region_overrides"
    ON waseet_region_overrides FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Service role all on waseet_region_overrides" ON waseet_region_overrides;
CREATE POLICY "Service role all on waseet_region_overrides"
    ON waseet_region_overrides FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE INSERT, UPDATE, DELETE ON waseet_region_overrides FROM anon, authenticated;
REVOKE SELECT ON waseet_region_overrides FROM anon;

COMMENT ON TABLE waseet_region_overrides IS
    'Manual region -> parent assignments. Outranks every derived rule and is re-applied after each refresh, so the weekly sync cannot undo a human decision.';

CREATE OR REPLACE FUNCTION waseet_apply_overrides()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_applied INT;
BEGIN
    -- moved into a named district of the same city
    UPDATE waseet_regions r
       SET district_id = d.id
      FROM waseet_region_overrides o
      JOIN waseet_districts d ON true
     WHERE r.id = o.region_id
       AND o.parent_kind = 'district'
       AND d.city_id = r.city_id
       AND d.name_ar = o.parent_ar;

    -- moved into a municipality
    UPDATE waseet_regions r
       SET municipality_ar = o.parent_ar
      FROM waseet_region_overrides o
     WHERE r.id = o.region_id
       AND o.parent_kind = 'municipality';

    -- deliberately parentless
    UPDATE waseet_regions r
       SET district_id = NULL, municipality_ar = NULL
      FROM waseet_region_overrides o
     WHERE r.id = o.region_id
       AND o.parent_kind = 'none';

    SELECT count(*) INTO v_applied FROM waseet_region_overrides;
    RETURN v_applied;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_apply_overrides() FROM PUBLIC, anon, authenticated;

-- Districts and municipalities both recompute from scratch, so each one
-- re-applies the manual decisions before it returns.
CREATE OR REPLACE FUNCTION waseet_refresh_municipalities()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_matched INT;
BEGIN
    UPDATE waseet_regions SET municipality_ar = NULL WHERE municipality_ar IS NOT NULL;

    WITH r AS (
        SELECT reg.id, reg.city_id,
               waseet_strip_article(COALESCE(reg.name_search_split, reg.name_search)) AS k
          FROM waseet_regions reg
    ),
    g AS (
        SELECT gz.governorate_code, gz.parent_ar,
               waseet_strip_article(gz.area_search) AS k
          FROM waseet_gazetteer gz
    ),
    m AS (
        SELECT DISTINCT ON (r.id) r.id, g.parent_ar
          FROM r
          JOIN waseet_cities c ON c.id = r.city_id
          JOIN g ON g.governorate_code = c.governorate_code
         WHERE r.k = g.k
            OR r.k LIKE g.k || ' %'
            OR r.k LIKE '% ' || g.k
            OR r.k LIKE '% ' || g.k || ' %'
            OR r.k ~ ('(^|\s)' || regexp_replace(g.k, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '[0-9٠-٩]')
         ORDER BY r.id, char_length(g.k) DESC
    )
    UPDATE waseet_regions reg SET municipality_ar = m.parent_ar FROM m WHERE reg.id = m.id;

    PERFORM waseet_apply_overrides();

    SELECT count(*)::INT INTO v_matched FROM waseet_regions WHERE municipality_ar IS NOT NULL;
    RETURN v_matched;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_municipalities() FROM PUBLIC, anon, authenticated;

SELECT waseet_apply_overrides();
