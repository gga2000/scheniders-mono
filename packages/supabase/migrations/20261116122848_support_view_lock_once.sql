-- Fix: support_view_lock_new_tables broke every new table with a foreign key.
--
-- Postgres reports such a table twice to the event trigger (the CREATE TABLE
-- and the ALTER TABLE that adds the key). Both rows passed the "no lock yet"
-- check, which is read once before the loop, so the second CREATE TRIGGER
-- failed with "already exists" and the whole migration rolled back. Each table
-- is now taken once.

CREATE OR REPLACE FUNCTION public.support_view_lock_new_tables()
RETURNS event_trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT DISTINCT e.objid
        FROM pg_event_trigger_ddl_commands() e
        JOIN pg_class c ON c.oid = e.objid
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE e.object_type IN ('table', 'partitioned table')
          AND n.nspname = 'public'
          AND NOT EXISTS (
              SELECT 1 FROM pg_trigger t
              WHERE t.tgrelid = c.oid AND t.tgname = 'zz_support_view_read_only')
    LOOP
        EXECUTE format(
            'CREATE TRIGGER zz_support_view_read_only BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON %s '
            'FOR EACH STATEMENT EXECUTE FUNCTION public.support_view_block_writes()', r.objid::regclass);
    END LOOP;
END;
$$;
