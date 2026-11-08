-- Security round 5.
-- R4-04: staff name/avatar stamps on order cards are client-written; an
-- avatar must be the bot marker or an https URL (all existing rows comply).
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_stamp_avatars_safe;
ALTER TABLE public.orders
    ADD CONSTRAINT orders_stamp_avatars_safe CHECK (
        (last_status_changed_by_avatar IS NULL OR last_status_changed_by_avatar = 'bot'
            OR (last_status_changed_by_avatar ~ '^https://[^\s"''<>]+$' AND length(last_status_changed_by_avatar) <= 2048))
        AND (last_followup_by_avatar IS NULL OR last_followup_by_avatar = 'bot'
            OR (last_followup_by_avatar ~ '^https://[^\s"''<>]+$' AND length(last_followup_by_avatar) <= 2048))
    ) NOT VALID;
ALTER TABLE public.orders VALIDATE CONSTRAINT orders_stamp_avatars_safe;

-- N-03: the blacklist flag in risk_metadata decides whether a storefront order
-- gets its WhatsApp confirmation, so only the server may set or clear it. A
-- direct client write keeps whatever the row had (like product_cost in
-- orders_snapshot_item_costs), so the staff risk-note update still saves.
CREATE OR REPLACE FUNCTION public.orders_guard_client_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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
    IF (NEW.risk_metadata -> 'is_blacklisted') IS DISTINCT FROM (OLD.risk_metadata -> 'is_blacklisted') THEN
        IF OLD.risk_metadata ? 'is_blacklisted' THEN
            NEW.risk_metadata := jsonb_set(coalesce(NEW.risk_metadata, '{}'::jsonb), '{is_blacklisted}', OLD.risk_metadata -> 'is_blacklisted');
        ELSE
            NEW.risk_metadata := NEW.risk_metadata - 'is_blacklisted';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- D-11: the store-builder draft autosave was open to every member, viewers
-- included. It now needs products.edit (admins and employees hold it).
CREATE OR REPLACE FUNCTION public.enforce_tenant_member_update_scope()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    -- Columns a store editor may change (store builder draft autosave).
    v_member_cols constant text[] := ARRAY['store_config_v2_draft', 'updated_at'];
    -- Columns a tenant admin may change from the browser (business settings).
    v_admin_cols constant text[] := ARRAY[
        'store_config_v2_draft', 'updated_at',
        'business_name', 'contact_email', 'contact_phone', 'city', 'address',
        'branding', 'store_config'
    ];
BEGIN
    -- Service role and SECURITY DEFINER functions (current_user = their owner)
    -- are trusted paths with their own checks.
    IF current_user NOT IN ('anon', 'authenticated') THEN
        RETURN NEW;
    END IF;

    IF (to_jsonb(NEW) - v_admin_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_admin_cols) THEN
        RAISE EXCEPTION 'tenant billing, lifecycle and live store config can only be changed by the platform'
            USING ERRCODE = '42501';
    END IF;

    IF (to_jsonb(NEW) - v_member_cols) IS DISTINCT FROM (to_jsonb(OLD) - v_member_cols)
       AND NOT public.is_tenant_admin(OLD.id) THEN
        RAISE EXCEPTION 'only a tenant admin can change business settings'
            USING ERRCODE = '42501';
    END IF;

    IF NEW.store_config_v2_draft IS DISTINCT FROM OLD.store_config_v2_draft
       AND NOT public.has_tenant_permission(OLD.id, 'products.edit') THEN
        RAISE EXCEPTION 'Your role cannot edit the store (needs products.edit)'
            USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$function$;
