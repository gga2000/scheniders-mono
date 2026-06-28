-- =============================================
-- ORDER WEB-PUSH: send an OS push notification when a new order arrives, so the
-- merchant is alerted even when the app is fully closed (the existing in-app
-- Notification-API alert only fires while a tab is open).
--
-- Reuses the chat push plumbing: the same VAPID keys + EDGE_PUSH_SECRET, the
-- same chat_push_subscriptions endpoints. Recipients = active tenant_members of
-- the order's tenant who have a push subscription (push is opt-in per user).
-- =============================================

-- Reuse chat_push_config (single push-config row) for the order sender URL too.
ALTER TABLE public.chat_push_config ADD COLUMN IF NOT EXISTS order_function_url text;

UPDATE public.chat_push_config
SET order_function_url = 'https://sduvpgqwhxragxtxztur.supabase.co/functions/v1/send-order-push'
WHERE id = 1;

-- Trigger fn: on new order, POST the order to the send-order-push edge function.
-- No-op until both the URL and the shared edge_secret are set (edge_secret is
-- already armed from the chat setup). Failure never blocks the order insert.
CREATE OR REPLACE FUNCTION public.notify_order_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_url text; v_secret text;
BEGIN
    IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
    SELECT order_function_url, edge_secret INTO v_url, v_secret FROM public.chat_push_config WHERE id = 1;
    IF v_url IS NULL OR v_secret IS NULL THEN RETURN NEW; END IF;  -- not configured → no-op
    BEGIN
        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
            body    := jsonb_build_object(
                'id', NEW.id, 'tenant_id', NEW.tenant_id, 'customer_name', NEW.customer_name,
                'sequence_number', NEW.sequence_number, 'price', NEW.price, 'priority', NEW.priority)
        );
    EXCEPTION WHEN OTHERS THEN NULL;  -- push delivery must never block the order insert
    END;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_order_push ON public.orders;
CREATE TRIGGER trg_notify_order_push
    AFTER INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.notify_order_push();

REVOKE EXECUTE ON FUNCTION public.notify_order_push() FROM PUBLIC, anon;  -- trigger fn; never called directly
