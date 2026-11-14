-- Platform audit R1 speed #6: the dashboard announcements list, the expenses
-- list and the team activity feed subscribe to postgres_changes on these
-- tables, but they were never in the supabase_realtime publication, so the
-- channels joined and never delivered. Each is low volume (under 150 rows a
-- week across all shops) and every client channel is tenant-filtered; RLS
-- still decides who receives each row.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['announcements', 'expenses', 'activity_logs'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END
$$;
