ALTER TABLE public.chat_push_config ADD COLUMN IF NOT EXISTS order_function_url text;

UPDATE public.chat_push_config
SET order_function_url = 'https://sduvpgqwhxragxtxztur.supabase.co/functions/v1/send-order-push'
WHERE id = 1;

CREATE OR REPLACE FUNCTION public.notify_order_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_url text; v_secret text;
BEGIN
    IF NEW.tenant_id IS NULL THEN RETURN NEW; END IF;
    SELECT order_function_url, edge_secret INTO v_url, v_secret FROM public.chat_push_config WHERE id = 1;
    IF v_url IS NULL OR v_secret IS NULL THEN RETURN NEW; END IF;
    BEGIN
        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
            body    := jsonb_build_object(
                'id', NEW.id, 'tenant_id', NEW.tenant_id, 'customer_name', NEW.customer_name,
                'sequence_number', NEW.sequence_number, 'price', NEW.price, 'priority', NEW.priority)
        );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_order_push ON public.orders;
CREATE TRIGGER trg_notify_order_push
    AFTER INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.notify_order_push();

REVOKE EXECUTE ON FUNCTION public.notify_order_push() FROM PUBLIC, anon;;
