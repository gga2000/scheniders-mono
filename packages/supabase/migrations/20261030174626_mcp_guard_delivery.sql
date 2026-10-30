-- Claude (MCP) connector, phase 2b: delivery and returns.
--
-- Same allowlist guard as 20261030130000, plus the one target ship_orders
-- writes with the caller's token: a print_batches row (the courier batch the
-- orders page records on Export). RLS keeps it to the member's stores.
-- Refunds, replacements and receiving returns go through
-- create_after_sale_order / receive_after_sale_item on the server with the
-- verified store, like the app's own server actions, so they add no target.

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
        -- catalog: price and visibility, with the product page's own trail
        ('PATCH',  'products'),
        ('PATCH',  'product_variants'),
        ('POST',   'product_price_history'),
        ('POST',   'product_activity_log'),
        ('POST',   'rpc/set_counted_stock'),
        -- customers: add to the blacklist (removing is a DELETE, so app only)
        ('POST',   'blacklist'),
        -- delivery: the courier batch ship_orders records
        ('POST',   'print_batches'),
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

NOTIFY pgrst, 'reload config';
