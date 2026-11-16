-- Merchant support, wave 3: pictures and voice notes are kept 30 days.
--
-- support_old_files(limit) names the files in the private support-shots and
-- support-voice buckets older than 30 days, oldest first. The daily
-- /api/cron/support-files-cleanup job removes them through the Storage API
-- (deleting storage.objects rows in SQL would leave the files behind).
-- The messages keep their text; the chat shows that the file is gone.
-- Service role only.

CREATE OR REPLACE FUNCTION public.support_old_files(p_limit integer DEFAULT 500)
RETURNS TABLE (bucket text, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT o.bucket_id, o.name
    FROM storage.objects o
    WHERE o.bucket_id IN ('support-shots', 'support-voice')
      AND o.created_at < now() - interval '30 days'
    ORDER BY o.created_at, o.name
    LIMIT least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

REVOKE ALL ON FUNCTION public.support_old_files(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_old_files(integer) TO service_role;