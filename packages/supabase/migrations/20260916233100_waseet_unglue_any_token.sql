CREATE OR REPLACE FUNCTION waseet_refresh_split_names()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_split INT;
BEGIN
    UPDATE waseet_regions
       SET name_display = NULL, name_search_split = NULL
     WHERE name_display IS NOT NULL OR name_search_split IS NOT NULL;

    WITH paired AS (
        SELECT r.id, r.city_id, s.ord, s.tok AS stok, c.tok AS ctok
          FROM waseet_regions r
          JOIN LATERAL unnest(string_to_array(r.name_search, ' ')) WITH ORDINALITY AS s(tok, ord)
            ON true
          JOIN LATERAL unnest(string_to_array(r.name_clean, ' ')) WITH ORDINALITY AS c(tok, ord)
            ON c.ord = s.ord
         WHERE array_length(string_to_array(r.name_search, ' '), 1)
             = array_length(string_to_array(r.name_clean, ' '), 1)
    ),
    hit AS (
        SELECT DISTINCT ON (p.id, p.ord)
               p.id, p.ord, p.stok, p.ctok,
               d.name_search AS base,
               substr(p.stok, char_length(d.name_search) + 1) AS remainder
          FROM paired p
          JOIN waseet_districts d ON d.city_id = p.city_id
         WHERE p.stok LIKE d.name_search || '%'
           AND p.stok <> d.name_search
           AND char_length(substr(p.stok, char_length(d.name_search) + 1)) >= 3
           AND substr(p.stok, char_length(d.name_search) + 1) !~ '[0-9٠-٩]'
           AND substr(p.stok, char_length(d.name_search) + 1)
               <> ALL (ARRAY['يون','يات','يين','تين','ايه','يته','يها','وين'])
           AND waseet_search_key(substr(p.ctok, 1, char_length(d.name_search)))
               = d.name_search
         ORDER BY p.id, p.ord, char_length(d.name_search) DESC
    ),
    rebuilt AS (
        SELECT p.id,
               string_agg(CASE WHEN h.id IS NULL THEN p.stok
                               ELSE h.base || ' ' || h.remainder END, ' ' ORDER BY p.ord) AS skey,
               string_agg(CASE WHEN h.id IS NULL THEN p.ctok
                               ELSE substr(p.ctok, 1, char_length(h.base)) || ' ' ||
                                    substr(p.ctok, char_length(h.base) + 1) END,
                          ' ' ORDER BY p.ord) AS ctext
          FROM paired p
          LEFT JOIN hit h ON h.id = p.id AND h.ord = p.ord
         GROUP BY p.id
        HAVING count(*) FILTER (WHERE h.id IS NOT NULL) > 0
    )
    UPDATE waseet_regions r
       SET name_search_split = btrim(regexp_replace(b.skey,  '(\S+)( \1)+', '\1', 'g')),
           name_display      = btrim(regexp_replace(b.ctext, '(\S+)( \1)+', '\1', 'g'))
      FROM rebuilt b
     WHERE r.id = b.id;

    GET DIAGNOSTICS v_split = ROW_COUNT;
    RETURN v_split;
END;
$$;

REVOKE EXECUTE ON FUNCTION waseet_refresh_split_names() FROM PUBLIC, anon, authenticated;

SELECT * FROM waseet_refresh_districts();
SELECT waseet_refresh_split_names();
SELECT * FROM waseet_refresh_districts();
SELECT waseet_refresh_canonical_regions();
SELECT waseet_refresh_region_review();
