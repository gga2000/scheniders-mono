-- Claude (MCP) connector: the database guard becomes an allowlist.
--
-- 20261030091317 refused writes to a list of sensitive targets. A denylist
-- judged by the raw request path misses whatever it does not name: a GraphQL
-- mutation arrives as `POST rpc/graphql`, a percent-encoded table name does
-- not match its plain spelling, and a Content-Profile header switches schema.
-- An OAuth-token request may now write only the targets below, with the
-- methods listed, in the public schema. Everything else is refused, including
-- GraphQL. Reads (GET/HEAD) stay open under RLS; PostgREST runs them in a
-- read-only transaction, so a GET on a function cannot write either.
--
-- Storage and Realtime do not pass through PostgREST, so restrictive policies
-- keep OAuth tokens to reading there.
--
-- App sessions (no `client_id` claim) are unaffected.

CREATE OR REPLACE FUNCTION public.mcp_request_guard()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    claims   jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    headers  jsonb := nullif(current_setting('request.headers', true), '')::jsonb;
    method   text  := upper(coalesce(current_setting('request.method', true), ''));
    segments text[];
    target   text;
BEGIN
    IF claims IS NULL OR coalesce(claims ->> 'client_id', '') = '' THEN
        RETURN;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.mcp_access a WHERE a.user_id = (claims ->> 'sub')::uuid
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Claude access is not enabled for this account';
    END IF;

    IF method IN ('GET', 'HEAD', 'OPTIONS') THEN
        RETURN;
    END IF;

    IF coalesce(headers ->> 'content-profile', 'public') <> 'public' THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Claude can only write to the store''s own tables';
    END IF;

    segments := string_to_array(trim(both '/' from coalesce(current_setting('request.path', true), '')), '/');
    target := CASE
        WHEN segments[1] = 'rpc' THEN 'rpc/' || coalesce(segments[2], '')
        ELSE coalesce(segments[1], '')
    END;

    IF (method, target) IN (
        -- order status and edits (version-guarded PATCH, RLS-scoped)
        ('PATCH',  'orders'),
        ('POST',   'order_status_history'),
        ('POST',   'order_notes'),
        ('POST',   'activity_logs'),
        -- status-change side effects: QC queue and supply deduction
        ('POST',   'qc_quarantine'),
        ('DELETE', 'qc_quarantine'),
        ('POST',   'rpc/adjust_product_stock'),
        -- read-only RPCs that PostgREST clients call with POST
        ('POST',   'rpc/search_orders_v2')
    ) THEN
        RETURN;
    END IF;

    RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = format('Claude cannot %s %s', lower(method), target);
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_request_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_request_guard() TO anon, authenticated, service_role;

-- Storage: an OAuth token may read files but never upload, replace or delete.
DROP POLICY IF EXISTS "mcp_no_storage_insert" ON storage.objects;
CREATE POLICY "mcp_no_storage_insert" ON storage.objects
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (coalesce(auth.jwt() ->> 'client_id', '') = '');

DROP POLICY IF EXISTS "mcp_no_storage_update" ON storage.objects;
CREATE POLICY "mcp_no_storage_update" ON storage.objects
    AS RESTRICTIVE FOR UPDATE TO authenticated
    USING (coalesce(auth.jwt() ->> 'client_id', '') = '');

DROP POLICY IF EXISTS "mcp_no_storage_delete" ON storage.objects;
CREATE POLICY "mcp_no_storage_delete" ON storage.objects
    AS RESTRICTIVE FOR DELETE TO authenticated
    USING (coalesce(auth.jwt() ->> 'client_id', '') = '');

-- Realtime: an OAuth token may listen but not broadcast or publish presence.
DROP POLICY IF EXISTS "mcp_no_realtime_send" ON realtime.messages;
CREATE POLICY "mcp_no_realtime_send" ON realtime.messages
    AS RESTRICTIVE FOR INSERT TO authenticated
    WITH CHECK (coalesce(auth.jwt() ->> 'client_id', '') = '');

NOTIFY pgrst, 'reload config';
