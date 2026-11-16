-- Merchant support, wave 2: "Check this shop" in the staff console.
--
-- One jsonb of facts about one shop, read in one call when staff press the
-- button beside a support conversation. The console decides what is fine,
-- worth a look or broken; this only gathers:
--
--   store      status, paused (and whether new orders are blocked, until when),
--              billing lock reason and since, prospect, trial end
--   products   on the store, marked sold out, on the store with no stock left
--   waseet     Al-Waseet calls in 7 days, failed ones, the newest failure
--   prime      the Prime link (null when the shop has none)
--   whatsapp   paused (reason, since) and messages sent/delivered/failed in 7 days
--   wallet     balance and the shop's low-balance line (null: no wallet row)
--   orders     newest real order and real orders in 7 days (admin_order_facts)
--   errors     errors merchants sent us with their support messages in 7 days
--
-- Returns null for a shop id that does not exist. Service role only.

CREATE OR REPLACE FUNCTION public.support_shop_check(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    t public.tenants;
    v_lock_reason text;
    v_lock_since timestamptz;
    v_out jsonb;
BEGIN
    SELECT * INTO t FROM public.tenants WHERE id = p_tenant_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT l.reason, l.since INTO v_lock_reason, v_lock_since
    FROM public.tenant_billing_lock(p_tenant_id) l
    WHERE l.reason IS NOT NULL
    LIMIT 1;

    SELECT jsonb_build_object(
        'store', jsonb_build_object(
            'status', t.status,
            'is_prospect', coalesce(t.is_prospect, false),
            'is_demo', t.is_demo,
            'paused', t.status = 'limited',
            'blocks_new_orders', coalesce((t.restrictions -> 'blocks' ->> 'new_orders')::boolean, false),
            'paused_until', t.restrictions ->> 'paused_until',
            'pause_reason', t.restrictions ->> 'reason',
            'lock_reason', v_lock_reason,
            'lock_since', v_lock_since,
            'trial_ends_at', t.trial_ends_at
        ),
        'products', (
            SELECT jsonb_build_object(
                'on_store', count(*),
                'sold_out_marked', count(*) FILTER (WHERE p.storefront_sold_out),
                'no_stock', count(*) FILTER (WHERE NOT p.storefront_sold_out AND stock.left_qty <= 0)
            )
            FROM public.products p
            CROSS JOIN LATERAL (
                -- A product with enabled variants sells from them; otherwise from itself.
                SELECT coalesce(
                    (SELECT sum(v.stock_quantity - coalesce(v.reserved_quantity, 0))
                     FROM public.product_variants v
                     WHERE v.product_id = p.id AND v.tenant_id = p.tenant_id AND v.is_enabled IS NOT FALSE),
                    p.stock_quantity - coalesce(p.reserved_quantity, 0)
                ) AS left_qty
            ) stock
            WHERE p.tenant_id = p_tenant_id
              AND p.status = 'active' AND p.is_visible AND NOT p.is_archived AND NOT coalesce(p.is_supply, false)
        ),
        'waseet', (
            SELECT jsonb_build_object(
                'calls_7d', count(*),
                'failed_7d', count(*) FILTER (WHERE NOT w.success),
                'last_error', (SELECT left(coalesce(f.error_message, ''), 300) FROM public.waseet_api_logs f
                               WHERE f.tenant_id = p_tenant_id AND NOT f.success
                                 AND f.created_at >= now() - interval '7 days'
                               ORDER BY f.created_at DESC LIMIT 1),
                'last_error_at', max(w.created_at) FILTER (WHERE NOT w.success)
            )
            FROM public.waseet_api_logs w
            WHERE w.tenant_id = p_tenant_id AND w.created_at >= now() - interval '7 days'
        ),
        'prime', (
            SELECT jsonb_build_object(
                'is_active', pc.is_active,
                'last_synced_at', pc.last_synced_at,
                'last_error', left(pc.last_error, 300)
            )
            FROM public.prime_connections pc
            WHERE pc.tenant_id = p_tenant_id
        ),
        'whatsapp', (
            SELECT jsonb_build_object(
                'paused', wp.tenant_id IS NOT NULL,
                'pause_reason', wp.reason,
                'paused_at', wp.paused_at,
                'sent_7d', coalesce(r.sent, 0),
                'delivered_7d', coalesce(r.delivered, 0),
                'failed_7d', coalesce(r.failed, 0)
            )
            FROM (SELECT 1) one
            LEFT JOIN LATERAL (
                SELECT s.tenant_id, s.reason, s.paused_at
                FROM public.whatsapp_sender_pauses s
                WHERE s.tenant_id = p_tenant_id AND s.resumed_at IS NULL
                ORDER BY s.paused_at DESC LIMIT 1
            ) wp ON true
            LEFT JOIN LATERAL (
                SELECT sum(d.sent) AS sent, sum(d.delivered) AS delivered, sum(d.failed) AS failed
                FROM public.v_whatsapp_delivery_rate d
                WHERE d.tenant_id = p_tenant_id AND d.day >= (now() - interval '7 days')::date
            ) r ON true
        ),
        'wallet', (
            SELECT jsonb_build_object('balance_iqd', w.balance_iqd, 'threshold_iqd', w.threshold_iqd)
            FROM public.wallet w
            WHERE w.tenant_id = p_tenant_id
        ),
        'orders', (
            SELECT jsonb_build_object(
                'last_at', max(o.created_at),
                'last_7d', count(*) FILTER (WHERE o.created_at >= now() - interval '7 days')
            )
            FROM public.admin_order_facts o
            WHERE o.tenant_id = p_tenant_id
        ),
        'errors', (
            SELECT jsonb_build_object(
                'count_7d', count(*),
                'last_message', (array_agg(coalesce(m.context ->> 'errorMessage', m.context ->> 'errorCode') ORDER BY m.created_at DESC))[1],
                'last_path', (array_agg(m.context ->> 'path' ORDER BY m.created_at DESC))[1],
                'last_at', max(m.created_at)
            )
            FROM public.support_messages m
            WHERE m.tenant_id = p_tenant_id
              AND m.sender_kind = 'merchant'
              AND m.created_at >= now() - interval '7 days'
              AND (m.context ? 'errorCode' OR m.context ? 'errorMessage')
        ),
        'checked_at', now()
    ) INTO v_out;

    RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.support_shop_check(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_shop_check(uuid) TO service_role;