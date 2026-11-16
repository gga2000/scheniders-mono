-- Merchant support, wave 2: a new merchant message pings support staff.
--
-- Staff turn on "Phone alerts" in the staff console (/support). The browser's
-- push subscription is stored here, one row per device. When a merchant writes
-- to support, a trigger hands the message to the `send-staff-push` edge
-- function, which sends a web push to every active staff member's devices.
--
-- Server-only, like the support tables: RLS on, no policies, no grants to the
-- browser roles. The staff console writes rows through its service-role route,
-- always as the signed-in admin.

CREATE TABLE public.admin_push_subscriptions (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint      text NOT NULL UNIQUE
                  CHECK (endpoint ~ '^https://' AND length(endpoint) <= 2000),
    p256dh        text NOT NULL CHECK (length(p256dh) BETWEEN 1 AND 200),
    auth          text NOT NULL CHECK (length(auth) BETWEEN 1 AND 100),
    user_agent    text CHECK (length(user_agent) <= 500),
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_push_subscriptions_admin_idx
    ON public.admin_push_subscriptions (admin_user_id);

ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.admin_push_subscriptions TO service_role;

-- Where the staff sender lives. Same project and secret as the merchant sender.
ALTER TABLE public.chat_push_config ADD COLUMN staff_function_url text;

UPDATE public.chat_push_config
SET staff_function_url = replace(order_function_url, '/send-order-push', '/send-staff-push')
WHERE id = 1 AND order_function_url IS NOT NULL;

CREATE OR REPLACE FUNCTION public.support_notify_staff()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_url        text;
    v_secret     text;
    v_recipients uuid[];
    v_shop       text;
BEGIN
    SELECT c.staff_function_url, c.edge_secret INTO v_url, v_secret
    FROM public.chat_push_config c WHERE c.id = 1;
    IF v_url IS NULL OR v_secret IS NULL THEN RETURN NEW; END IF;

    SELECT array_agg(DISTINCT a.user_id) INTO v_recipients
    FROM public.admin_users a
    WHERE a.is_active
      AND a.admin_role IN ('super_admin', 'support_staff')
      AND EXISTS (SELECT 1 FROM public.admin_push_subscriptions s WHERE s.admin_user_id = a.user_id);

    IF v_recipients IS NULL THEN RETURN NEW; END IF;

    SELECT t.business_name INTO v_shop FROM public.tenants t WHERE t.id = NEW.tenant_id;

    -- net.http_post only queues the request. If queueing itself fails, the
    -- merchant's message must still be saved: the inbox is the durable channel
    -- and the push is only a nudge.
    BEGIN
        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_secret),
            body    := jsonb_build_object(
                'case_id',    NEW.case_id,
                'message_id', NEW.id,
                'shop',       COALESCE(v_shop, ''),
                'sender',     COALESCE(NEW.sender_name, ''),
                'preview',    left(NEW.body, 140),
                'recipients', to_jsonb(v_recipients))
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'support_notify_staff: push not queued for message %: %', NEW.id, SQLERRM;
    END;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.support_notify_staff() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_support_notify_staff
    AFTER INSERT ON public.support_messages
    FOR EACH ROW
    WHEN (NEW.sender_kind = 'merchant')
    EXECUTE FUNCTION public.support_notify_staff();
