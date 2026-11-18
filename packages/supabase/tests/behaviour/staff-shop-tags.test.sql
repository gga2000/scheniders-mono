-- Behaviour test for staff tags on a shop, run against the migration in
-- packages/supabase/migrations (see run.sh). Every check raises on a wrong
-- result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   one row of tags per shop; saving again replaces them;
--   at most 20 tags, none of them NULL;
--   a tag row for a shop that does not exist is refused;
--   deleting a shop deletes its tags;
--   no browser role (anon, authenticated) can read or write the table, and
--   row security is on: a merchant never sees the staff's labels.

\set ON_ERROR_STOP 1

INSERT INTO public.tenants (id) VALUES
  ('50000000-0000-4000-8000-00000000000a'),
  ('50000000-0000-4000-8000-00000000000b');

DO $t$
DECLARE
    a constant uuid := '50000000-0000-4000-8000-00000000000a';
    b constant uuid := '50000000-0000-4000-8000-00000000000b';
    saved text[];
    rows_for_a integer;
BEGIN
    -- Save, then save again: one row, the new tags.
    INSERT INTO public.staff_shop_tags (tenant_id, tags) VALUES (a, ARRAY['VIP', 'At Risk'])
    ON CONFLICT (tenant_id) DO UPDATE SET tags = excluded.tags;
    INSERT INTO public.staff_shop_tags (tenant_id, tags) VALUES (a, ARRAY['VIP'])
    ON CONFLICT (tenant_id) DO UPDATE SET tags = excluded.tags;
    SELECT count(*), max(tags) INTO rows_for_a, saved FROM public.staff_shop_tags WHERE tenant_id = a;
    IF rows_for_a <> 1 OR saved <> ARRAY['VIP'] THEN
        RAISE EXCEPTION 'second save left % rows with %', rows_for_a, saved;
    END IF;

    -- 21 tags: refused.
    BEGIN
        INSERT INTO public.staff_shop_tags (tenant_id, tags)
        VALUES (b, ARRAY(SELECT 'tag ' || n FROM generate_series(1, 21) AS n));
        RAISE EXCEPTION 'saved 21 tags';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- A NULL tag: refused.
    BEGIN
        INSERT INTO public.staff_shop_tags (tenant_id, tags) VALUES (b, ARRAY['VIP', NULL]);
        RAISE EXCEPTION 'saved a NULL tag';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- A shop that does not exist: refused (the console answers 404).
    BEGIN
        INSERT INTO public.staff_shop_tags (tenant_id, tags)
        VALUES ('50000000-0000-4000-8000-0000000000ff', ARRAY['VIP']);
        RAISE EXCEPTION 'saved tags for a shop that does not exist';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    -- Deleting a shop deletes its tags.
    DELETE FROM public.tenants WHERE id = a;
    IF EXISTS (SELECT 1 FROM public.staff_shop_tags WHERE tenant_id = a) THEN
        RAISE EXCEPTION 'tags outlived their shop';
    END IF;

    -- Browser roles: no access at all; the service role reads and writes.
    IF has_table_privilege('anon', 'public.staff_shop_tags', 'SELECT')
       OR has_table_privilege('authenticated', 'public.staff_shop_tags', 'SELECT')
       OR has_table_privilege('authenticated', 'public.staff_shop_tags', 'INSERT')
       OR has_table_privilege('authenticated', 'public.staff_shop_tags', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.staff_shop_tags', 'DELETE') THEN
        RAISE EXCEPTION 'a browser role can reach staff_shop_tags';
    END IF;
    IF NOT has_table_privilege('service_role', 'public.staff_shop_tags', 'SELECT, INSERT, UPDATE, DELETE') THEN
        RAISE EXCEPTION 'the service role cannot read and write staff_shop_tags';
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.staff_shop_tags'::regclass) THEN
        RAISE EXCEPTION 'row security is off on staff_shop_tags';
    END IF;
END;
$t$;
