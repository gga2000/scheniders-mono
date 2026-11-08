-- Security wave 6 (round 5 critic R5-01, R4-04 name half).
-- R5-01: is_test hides an order from courier, WhatsApp, revenue and plan usage,
--        so staff may only set it when creating the order, never flip it later.
-- R4-04: "who did it" columns are stamped from the signed-in user, not taken
--        from the client, so attribution cannot be forged.
CREATE OR REPLACE FUNCTION public.orders_guard_client_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_name   text;
    v_avatar text;
BEGIN
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;
    -- product_cost / item_unit_costs are already rebuilt server-side by
    -- orders_snapshot_item_costs; net_profit had no such owner.
    IF NEW.net_profit IS DISTINCT FROM OLD.net_profit THEN
        RAISE EXCEPTION 'Order profit is set by the server'
            USING ERRCODE = '42501';
    END IF;
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       AND NOT public.has_tenant_permission(NEW.tenant_id, 'orders.delete') THEN
        RAISE EXCEPTION 'Your role cannot do this (needs orders.delete)'
            USING ERRCODE = '42501';
    END IF;
    IF NEW.is_test IS DISTINCT FROM OLD.is_test THEN
        RAISE EXCEPTION 'An order can only be marked as a test when it is created'
            USING ERRCODE = '42501';
    END IF;
    IF (NEW.risk_metadata -> 'is_blacklisted') IS DISTINCT FROM (OLD.risk_metadata -> 'is_blacklisted') THEN
        IF OLD.risk_metadata ? 'is_blacklisted' THEN
            NEW.risk_metadata := jsonb_set(coalesce(NEW.risk_metadata, '{}'::jsonb), '{is_blacklisted}', OLD.risk_metadata -> 'is_blacklisted');
        ELSE
            NEW.risk_metadata := NEW.risk_metadata - 'is_blacklisted';
        END IF;
    END IF;

    IF (NEW.last_status_changed_by_name IS NOT NULL
            AND (NEW.last_status_changed_by_name IS DISTINCT FROM OLD.last_status_changed_by_name
                 OR NEW.last_status_changed_by_avatar IS DISTINCT FROM OLD.last_status_changed_by_avatar))
       OR (NEW.last_followup_by_name IS NOT NULL
            AND (NEW.last_followup_by_name IS DISTINCT FROM OLD.last_followup_by_name
                 OR NEW.last_followup_by_avatar IS DISTINCT FROM OLD.last_followup_by_avatar)) THEN
        SELECT nullif(btrim(p.display_name), ''), p.avatar_url
          INTO v_name, v_avatar
          FROM public.user_profiles p
         WHERE p.id = auth.uid();
        v_name := coalesce(v_name, nullif(btrim(auth.jwt() ->> 'email'), ''), 'System');

        IF NEW.last_status_changed_by_name IS NOT NULL
           AND (NEW.last_status_changed_by_name IS DISTINCT FROM OLD.last_status_changed_by_name
                OR NEW.last_status_changed_by_avatar IS DISTINCT FROM OLD.last_status_changed_by_avatar) THEN
            NEW.last_status_changed_by_name := v_name;
            NEW.last_status_changed_by_avatar := v_avatar;
        END IF;
        IF NEW.last_followup_by_name IS NOT NULL
           AND (NEW.last_followup_by_name IS DISTINCT FROM OLD.last_followup_by_name
                OR NEW.last_followup_by_avatar IS DISTINCT FROM OLD.last_followup_by_avatar) THEN
            NEW.last_followup_by_name := v_name;
            NEW.last_followup_by_avatar := v_avatar;
        END IF;
    END IF;
    RETURN NEW;
END;
$function$;
