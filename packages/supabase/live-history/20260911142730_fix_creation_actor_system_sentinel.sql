-- `orders.last_status_changed_by_name` DEFAULTs to 'System', and the client uses
-- the same literal as its own "no identity" fallback
-- (display_name || email || 'System'). So 'System' means unclaimed, not an
-- actor — otherwise every webhook order is credited to a user called System.
CREATE OR REPLACE FUNCTION public.resolve_order_creation_actor(
    p_order   public.orders,
    OUT actor_name   TEXT,
    OUT actor_avatar TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_uid UUID;
BEGIN
    actor_name := NULLIF(
        NULLIF(btrim(COALESCE(p_order.last_status_changed_by_name, '')), ''),
        'System');
    actor_avatar := p_order.last_status_changed_by_avatar;
    IF actor_name IS NOT NULL THEN RETURN; END IF;

    v_uid := auth.uid();
    IF v_uid IS NOT NULL THEN
        SELECT up.display_name, up.avatar_url INTO actor_name, actor_avatar
        FROM public.user_profiles up WHERE up.id = v_uid;
        actor_name := NULLIF(btrim(COALESCE(actor_name, '')), '');
        IF actor_name IS NOT NULL THEN RETURN; END IF;
    END IF;

    actor_avatar := NULL;
    actor_name := CASE lower(COALESCE(p_order.source, ''))
        WHEN 'lightfunnels' THEN 'LightFunnels'
        ELSE 'Automation'
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_order_creation_actor(public.orders) FROM PUBLIC, anon, authenticated;;
