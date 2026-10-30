-- Claude (MCP) connector: access list and database guard.
--
-- The MCP connector signs users in through Supabase Auth's OAuth 2.1 server.
-- The access token Claude receives is a normal user JWT with RLS applied, but
-- it carries a `client_id` claim that the app's own session tokens do not. The
-- holder of that token can call PostgREST directly, not only through our
-- /api/mcp tools, so the limits on what Claude may do are enforced here:
--
--   1. Only users on public.mcp_access may use an OAuth token at all.
--   2. Rows are never hard-deleted through an OAuth token (qc_quarantine, the
--      status-change side effect that un-queues returned items, is the one
--      exception).
--   3. Team, roles and permissions, billing, wallet, payroll, tenant settings
--      and platform tables cannot be written through an OAuth token.
--
-- App sessions (no `client_id`) are unaffected: the guard returns at once.

CREATE TABLE IF NOT EXISTS public.mcp_access (
    user_id    uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    granted_at timestamptz NOT NULL DEFAULT now(),
    note       text
);

-- Service role only: RLS on with no policies, and no grants to API roles.
ALTER TABLE public.mcp_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mcp_access FROM anon, authenticated;

COMMENT ON TABLE public.mcp_access IS
    'Users allowed to connect Claude (MCP) to the platform app. Checked by mcp_request_guard() and /api/mcp.';

CREATE OR REPLACE FUNCTION public.mcp_request_guard()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    claims   jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
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

    segments := string_to_array(trim(both '/' from coalesce(current_setting('request.path', true), '')), '/');
    target := CASE
        WHEN segments[1] = 'rpc' THEN 'rpc/' || coalesce(segments[2], '')
        ELSE coalesce(segments[1], '')
    END;

    IF method = 'DELETE' AND target <> 'qc_quarantine' THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Claude cannot delete records';
    END IF;

    IF target = ANY (ARRAY[
        -- team, roles and permissions
        'tenant_members', 'team_invites', 'role_permissions', 'user_permissions',
        'user_profiles', 'access_requests', 'account_link_tokens',
        'telegram_employee_link', 'telegram_link_codes', 'rpc/set_team_member_active',
        -- billing and money
        'wallet', 'wallet_transactions', 'subscriptions', 'usage_tracking', 'plan_limits',
        'referral_codes', 'referrals',
        -- payroll
        'payroll_records', 'employee_salary_configs', 'role_salary_defaults',
        'salary_advances', 'salary_config_history', 'salary_penalties', 'performance_bonuses',
        -- the store itself and its integrations
        'tenants', 'tenant_domains', 'tenant_integrations', 'tenant_slug_history',
        -- platform tables
        'admin_activity_logs', 'admin_commission_config', 'admin_employee_achievements',
        'admin_employee_commissions', 'admin_employee_tracking', 'admin_notes',
        'admin_settings', 'admin_users', 'admin_watchlist', 'app_settings',
        'api_rate_limits', 'security_logs', 'order_deletion_log', 'mcp_access',
        -- chat administration
        'rpc/chat_delete_conversation', 'rpc/chat_remove_member'
    ]) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = format('Claude cannot change %s', target);
    END IF;
END;
$$;

-- PostgREST runs the pre-request function as the request's role, so every API
-- role must be able to execute it. Calling it directly is harmless: it reads
-- nothing back and only refuses.
REVOKE ALL ON FUNCTION public.mcp_request_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_request_guard() TO anon, authenticated, service_role;

ALTER ROLE authenticator SET pgrst.db_pre_request = 'public.mcp_request_guard';
NOTIFY pgrst, 'reload config';
