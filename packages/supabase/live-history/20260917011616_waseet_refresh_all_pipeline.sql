-- The refresh steps depend on each other in one specific order, and each one
-- recomputes from scratch. Keeping that order in the application meant a
-- reordering there could silently drop the manual overrides, so the sequence
-- lives here and the sync calls one function.
CREATE OR REPLACE FUNCTION waseet_refresh_all()
RETURNS TABLE (
    districts      INT,
    split_names    INT,
    duplicates     INT,
    municipalities INT,
    postal_codes   INT,
    overrides      INT,
    review_pairs   INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- districts first: the un-glue step needs their names as its vocabulary
    PERFORM waseet_refresh_districts();
    SELECT waseet_refresh_split_names() INTO split_names;
    -- again, now that splitting has exposed districts hidden inside glued tokens
    SELECT d.districts INTO districts FROM waseet_refresh_districts() d;

    SELECT waseet_refresh_canonical_regions() INTO duplicates;
    SELECT waseet_refresh_municipalities() INTO municipalities;
    SELECT p.regions_matched INTO postal_codes FROM waseet_refresh_postal_codes() p;

    -- last word belongs to the human
    SELECT waseet_apply_overrides() INTO overrides;

    SELECT waseet_refresh_region_review() INTO review_pairs;
    RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_all() FROM PUBLIC, anon, authenticated;

SELECT * FROM waseet_refresh_all();;
