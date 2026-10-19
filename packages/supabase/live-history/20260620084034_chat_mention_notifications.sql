CREATE TABLE public.chat_notifications (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    recipient_id    uuid NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    actor_id        uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    actor_name      text NOT NULL,
    actor_avatar    text,
    conversation_id uuid REFERENCES public.chat_conversations(id) ON DELETE CASCADE,
    message_id      uuid REFERENCES public.chat_messages(id) ON DELETE CASCADE,
    preview         text NOT NULL DEFAULT '',
    is_read         boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX chat_notifications_recipient_idx ON public.chat_notifications (recipient_id, created_at DESC);

ALTER TABLE public.chat_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY chat_notifications_recipient_read ON public.chat_notifications
    FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY chat_notifications_recipient_update ON public.chat_notifications
    FOR UPDATE USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());

-- Realtime postgres_changes feed for the dropdown (mirrors order_notifications).
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_notifications;;
