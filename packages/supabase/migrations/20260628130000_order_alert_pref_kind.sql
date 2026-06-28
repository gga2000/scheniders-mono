-- Allow the synthetic 'order_alert' kind in chat_notification_prefs so a user can
-- toggle NEW-ORDER web push independently of chat push (level 'none' = muted).
ALTER TABLE public.chat_notification_prefs DROP CONSTRAINT IF EXISTS chat_notification_prefs_kind_check;
ALTER TABLE public.chat_notification_prefs ADD CONSTRAINT chat_notification_prefs_kind_check
    CHECK (kind = ANY (ARRAY['channel'::text, 'dm'::text, 'group'::text, 'order'::text, 'order_alert'::text]));
