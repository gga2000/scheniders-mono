-- Security wave 7 (A-11, Ali 2026-11-08: "store tools via Claude only").
-- OAuth clients register themselves (dynamic registration) and may call
-- themselves anything, including "Claude". What cannot be faked is where the
-- authorization code is sent: a client is Claude's only if every redirect URI
-- it registered is on claude.ai or claude.com over https.
CREATE OR REPLACE FUNCTION public.mcp_client_is_claude(p_client_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
    SELECT coalesce((
        SELECT bool_and(uri ~ '^https://(claude\.ai|claude\.com)/')
          FROM auth.oauth_clients c,
               regexp_split_to_table(btrim(c.redirect_uris), '[,\s]+') AS uri
         WHERE c.id = p_client_id
           AND c.deleted_at IS NULL
           AND uri <> ''
    ), false);
$function$;

REVOKE ALL ON FUNCTION public.mcp_client_is_claude(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mcp_client_is_claude(uuid) TO service_role;
