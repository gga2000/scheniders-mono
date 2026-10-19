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
    PERFORM waseet_refresh_districts();
    SELECT waseet_refresh_split_names() INTO split_names;
    SELECT d.districts INTO districts FROM waseet_refresh_districts() d;

    SELECT waseet_refresh_canonical_regions() INTO duplicates;
    SELECT waseet_refresh_municipalities() INTO municipalities;
    SELECT p.regions_matched INTO postal_codes FROM waseet_refresh_postal_codes() p;

    SELECT waseet_apply_overrides() INTO overrides;

    SELECT waseet_refresh_region_review() INTO review_pairs;
    RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_all() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION waseet_refresh_all() IS
    'Runs the whole derivation in dependency order and ends by re-applying manual overrides, so a human decision always outranks the rules.';;
