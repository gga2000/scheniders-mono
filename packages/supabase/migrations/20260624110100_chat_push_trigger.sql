-- =============================================
-- CHAT PHASE 6B: push trigger (chat_notifications INSERT → edge function via pg_net)
-- =============================================
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Config for the sender (the edge function URL + the shared bearer secret). RLS
-- denies all client roles; only service_role / SECURITY DEFINER can read it.
-- The user fills `edge_secret` (== the EDGE_PUSH_SECRET edge secret) to arm push.
CREATE TABLE IF NOT EXISTS public.chat_push_config (
    id           int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    function_url text,
    edge_secret  text,
    updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_push_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_push_config FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.chat_notify_push()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_url text; v_secret text;
BEGIN
    SELECT function_url, edge_secret INTO v_url, v_secret FROM public.chat_push_config WHERE id = 1;
    IF v_url IS NULL OR v_secret IS NULL THEN RETURN NEW; END IF;  -- not configured → no-op
    BEGIN
        PERFORM net.http_post(
            url     := v_url,
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
            body    := to_jsonb(NEW)
        );
    EXCEPTION WHEN OTHERS THEN NULL;  -- push delivery must never block the notification insert
    END;
    RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_chat_notify_push ON public.chat_notifications;
CREATE TRIGGER trg_chat_notify_push
    AFTER INSERT ON public.chat_notifications
    FOR EACH ROW EXECUTE FUNCTION public.chat_notify_push();

-- Pre-seed the function URL; edge_secret stays NULL (= disarmed) until the user sets it.
INSERT INTO public.chat_push_config (id, function_url, edge_secret)
VALUES (1, 'https://sduvpgqwhxragxtxztur.supabase.co/functions/v1/send-chat-push', NULL)
ON CONFLICT (id) DO NOTHING;
