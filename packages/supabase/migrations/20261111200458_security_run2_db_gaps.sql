-- Security audit run 2: smaller database gaps.
--
--   * security_logs: a deactivated store admin could still read the vault
--     audit trail (the policy checked membership inline, not is_active).
--   * The "storefront edits" pause now also covers store_config_v2 and its
--     draft, the config the storefront actually renders.
--   * Wallet balances and top-up amounts (category 'finance') reach only
--     staff with system.financials.view: feed, unread count, direct reads
--     and push alerts.
--   * shield_lookup gets the same new-number burst guard as
--     shield_customer_trust.

DROP POLICY IF EXISTS security_logs_tenant_admin_select ON public.security_logs;
CREATE POLICY security_logs_tenant_admin_select ON public.security_logs
    FOR SELECT TO authenticated
    USING (tenant_id IS NOT NULL AND public.is_tenant_admin(tenant_id));

CREATE OR REPLACE FUNCTION public.enforce_storefront_writes_block()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
    -- Only fire when storefront-related columns actually changed.
    IF (NEW.branding IS DISTINCT FROM OLD.branding
        OR NEW.store_config IS DISTINCT FROM OLD.store_config
        OR NEW.store_config_v2 IS DISTINCT FROM OLD.store_config_v2
        OR NEW.store_config_v2_draft IS DISTINCT FROM OLD.store_config_v2_draft)
       AND public.tenant_block_active(NEW.id, 'storefront_writes') THEN
        RAISE EXCEPTION
          'Tenant is paused — storefront edits are blocked'
          USING ERRCODE = 'P0001',
                HINT = 'TENANT_PAUSED:storefront_writes';
    END IF;
    RETURN NEW;
END;
$function$;

ALTER POLICY notifications_select ON public.notifications USING (
    tenant_id IN (SELECT public.get_user_tenant_ids())
    AND (audience = 'tenant' OR recipient_id = auth.uid())
    AND (category <> 'finance' OR public.has_tenant_permission(tenant_id, 'system.financials.view'))
);

CREATE OR REPLACE FUNCTION public.notification_feed(p_limit integer DEFAULT 50, p_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_filter text DEFAULT 'all'::text)
 RETURNS TABLE(id uuid, type text, category text, actor_name text, actor_avatar text, entity_type text, entity_id uuid, entity_label text, payload jsonb, priority text, group_key text, created_at timestamp with time zone, is_read boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_uid     UUID := auth.uid();
    v_tenants UUID[];
    v_cleared TIMESTAMPTZ;
    v_read    TIMESTAMPTZ;
BEGIN
    IF v_uid IS NULL THEN RETURN; END IF;

    SELECT array_agg(t) INTO v_tenants FROM public.get_user_tenant_ids() t;
    IF v_tenants IS NULL THEN RETURN; END IF;

    SELECT f.cleared_before, f.read_before INTO v_cleared, v_read
    FROM public.notification_feed_state f WHERE f.user_id = v_uid;

    RETURN QUERY
    SELECT n.id, n.type, n.category, n.actor_name, n.actor_avatar,
           n.entity_type, n.entity_id, n.entity_label, n.payload,
           n.priority, n.group_key, n.created_at,
           (
               (v_read IS NOT NULL AND n.created_at <= v_read)
               OR EXISTS (
                   SELECT 1 FROM public.notification_user_state s
                   WHERE s.notification_id = n.id AND s.user_id = v_uid
                     AND s.read_at IS NOT NULL)
           ) AS is_read
    FROM public.notifications n
    WHERE n.tenant_id = ANY (v_tenants)
      AND (n.audience = 'tenant' OR n.recipient_id = v_uid)
      -- Wallet balances and top-up amounts: only staff who may see money.
      AND (n.category <> 'finance' OR public.has_tenant_permission(n.tenant_id, 'system.financials.view'))
      AND (v_cleared IS NULL OR n.created_at > v_cleared)
      AND (p_before IS NULL OR n.created_at < p_before)
      AND NOT EXISTS (
              SELECT 1 FROM public.notification_user_state s
              WHERE s.notification_id = n.id AND s.user_id = v_uid
                AND s.dismissed_at IS NOT NULL)
      AND NOT EXISTS (
              SELECT 1 FROM public.notification_mutes m
              WHERE m.user_id = v_uid
                AND m.entity_type = n.entity_type
                AND m.entity_id = n.entity_id
                AND n.created_at > m.created_at)
      AND (
            p_filter = 'all'
        OR (p_filter = 'mentions' AND n.category = 'chat')
        OR (p_filter = 'prime' AND n.type LIKE 'prime.%')
        OR (p_filter = 'unread' AND NOT (
                (v_read IS NOT NULL AND n.created_at <= v_read)
                OR EXISTS (
                    SELECT 1 FROM public.notification_user_state s
                    WHERE s.notification_id = n.id AND s.user_id = v_uid
                      AND s.read_at IS NOT NULL)))
      )
    ORDER BY n.created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
END;
$function$;

CREATE OR REPLACE FUNCTION public.notification_unread_count()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_uid     UUID := auth.uid();
    v_tenants UUID[];
    v_cleared TIMESTAMPTZ;
    v_read    TIMESTAMPTZ;
    v_count   INTEGER;
BEGIN
    IF v_uid IS NULL THEN RETURN 0; END IF;

    SELECT array_agg(t) INTO v_tenants FROM public.get_user_tenant_ids() t;
    IF v_tenants IS NULL THEN RETURN 0; END IF;

    SELECT f.cleared_before, f.read_before INTO v_cleared, v_read
    FROM public.notification_feed_state f WHERE f.user_id = v_uid;

    SELECT count(*) INTO v_count
    FROM (
        SELECT DISTINCT unit
        FROM (
            SELECT CASE
                       WHEN n.type = 'order.status_changed'
                           THEN 'status-hour:' || floor(extract(epoch FROM n.created_at) / 3600)::bigint
                       ELSE n.id::text
                   END AS unit
            FROM public.notifications n
            WHERE n.tenant_id = ANY (v_tenants)
              AND (n.audience = 'tenant' OR n.recipient_id = v_uid)
              AND (n.category <> 'finance' OR public.has_tenant_permission(n.tenant_id, 'system.financials.view'))
              AND (v_cleared IS NULL OR n.created_at > v_cleared)
              AND (v_read IS NULL OR n.created_at > v_read)
              AND NOT EXISTS (
                      SELECT 1 FROM public.notification_user_state s
                      WHERE s.notification_id = n.id AND s.user_id = v_uid
                        AND (s.dismissed_at IS NOT NULL OR s.read_at IS NOT NULL))
              AND NOT EXISTS (
                      SELECT 1 FROM public.notification_mutes m
                      WHERE m.user_id = v_uid
                        AND m.entity_type = n.entity_type
                        AND m.entity_id = n.entity_id
                        AND n.created_at > m.created_at)
            ORDER BY n.created_at DESC
            LIMIT 1000
        ) newest
        LIMIT 100
    ) units;

    RETURN COALESCE(v_count, 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.dispatch_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_url        TEXT;
    v_secret     TEXT;
    v_recipients UUID[];
BEGIN
    SELECT order_function_url, edge_secret INTO v_url, v_secret
    FROM public.chat_push_config WHERE id = 1;
    IF v_url IS NULL OR v_secret IS NULL THEN RETURN NEW; END IF;

    SELECT array_agg(u) INTO v_recipients FROM (
        SELECT DISTINCT tm.user_id AS u
        FROM public.tenant_members tm
        JOIN public.user_profiles active_profile
          ON active_profile.id = tm.user_id AND COALESCE(active_profile.is_active, true)
        WHERE tm.tenant_id = NEW.tenant_id
          AND tm.status = 'active'
          AND (NEW.audience = 'tenant' OR tm.user_id = NEW.recipient_id)
          -- Never push someone their own action back at them.
          AND NOT EXISTS (
              SELECT 1 FROM public.user_profiles up
              WHERE up.id = tm.user_id AND up.display_name = NEW.actor_name)
          -- C3: muted this specific order/conversation.
          AND NOT EXISTS (
              SELECT 1 FROM public.notification_mutes m
              WHERE m.user_id = tm.user_id
                AND m.entity_type = NEW.entity_type
                AND m.entity_id = NEW.entity_id)
          -- Wallet balances and top-up amounts: only staff who may see money.
          AND (NEW.category <> 'finance'
               OR public.member_has_permission(NEW.tenant_id, tm.user_id, 'system.financials.view'))
          AND public.notification_channel_enabled(tm.user_id, NEW.tenant_id, NEW.category, 'push')
          AND EXISTS (SELECT 1 FROM public.chat_push_subscriptions s WHERE s.user_id = tm.user_id)
    ) q;

    IF v_recipients IS NULL OR array_length(v_recipients, 1) IS NULL THEN
        RETURN NEW;
    END IF;

    BEGIN
        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_secret),
            body    := jsonb_build_object(
                'notification_id', NEW.id,
                'tenant_id',       NEW.tenant_id,
                'type',            NEW.type,
                'category',        NEW.category,
                'actor_name',      NEW.actor_name,
                'entity_type',     NEW.entity_type,
                'entity_id',       NEW.entity_id,
                'entity_label',    NEW.entity_label,
                'payload',         NEW.payload,
                'priority',        NEW.priority,
                'recipients',      to_jsonb(v_recipients))
        );
    EXCEPTION WHEN OTHERS THEN
        -- A push that cannot be sent must never roll back the notification that
        -- caused it; the in-app feed is the durable channel.
        NULL;
    END;

    RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.shield_lookup(p_phones text[])
 RETURNS TABLE(phone text, band text, score integer, confidence text, stores integer, outcomes integer, delivered integer, delivered_stores integer, bad jsonb, sequence text[], last_bad_orders_ago integer, trend text, trust integer, trust_new boolean, trust_steps jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_tenant uuid := public.require_current_tenant();
    v_norms text[];
    v_recent bigint;
BEGIN
    IF COALESCE(cardinality(p_phones), 0) = 0 THEN RETURN; END IF;
    IF cardinality(p_phones) > 200 THEN
        RAISE EXCEPTION 'shield_lookup: at most 200 phones per call' USING ERRCODE = '22023';
    END IF;

    -- Only numbers that already ordered from this store: nobody can map the
    -- network by pasting phone lists.
    SELECT array_agg(DISTINCT n) INTO v_norms
      FROM (SELECT public.normalize_phone_for_search(p) AS n FROM unnest(p_phones) p) x
     WHERE length(n) = 10
       AND EXISTS (SELECT 1 FROM public.customer_trust ct WHERE ct.tenant_id = v_tenant AND ct.phone = x.n);
    IF v_norms IS NULL THEN RETURN; END IF;

    -- Same new-number burst guard as shield_customer_trust: when a store adds
    -- 500+ new numbers in an hour (bulk fake orders), those numbers wait an
    -- hour before they show network data.
    WITH ph AS (
        SELECT public.normalize_phone_for_search(o.phone) AS n, min(o.created_at) AS first_at
          FROM public.orders o
         WHERE o.tenant_id = v_tenant AND o.deleted_at IS NULL AND NOT COALESCE(o.is_test, false)
         GROUP BY 1
    ), burst AS (
        SELECT count(*) > 500 AS on FROM ph WHERE ph.first_at > now() - interval '1 hour'
    )
    SELECT array_agg(x.n) INTO v_norms
      FROM unnest(v_norms) AS x(n), burst
     WHERE NOT (burst.on AND EXISTS (SELECT 1 FROM ph WHERE ph.n = x.n AND ph.first_at > now() - interval '1 hour'));
    IF v_norms IS NULL THEN RETURN; END IF;

    SELECT COALESCE(sum(l.phones), 0) INTO v_recent
      FROM shield.lookup_log l
     WHERE l.tenant_id = v_tenant AND l.at > now() - interval '1 hour';
    IF v_recent + cardinality(v_norms) > 6000 THEN
        RAISE EXCEPTION 'shield_lookup: hourly lookup limit reached' USING ERRCODE = '54000';
    END IF;
    INSERT INTO shield.lookup_log (tenant_id, phones) VALUES (v_tenant, cardinality(v_norms));

    RETURN QUERY
    SELECT c.phone, c.band, c.score, c.confidence, c.stores, c.outcomes, c.delivered, c.delivered_stores,
           c.bad, c.sequence, c.last_bad_orders_ago, c.trend,
           t.trust, t.trust_new, t.trust_steps
      FROM shield.compute(v_tenant, v_norms) c
      JOIN shield.trust(v_tenant, v_norms) t ON t.phone = c.phone;
END;
$function$;
