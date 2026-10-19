ALTER TABLE public.chat_notification_prefs DROP CONSTRAINT IF EXISTS chat_notification_prefs_kind_check;
ALTER TABLE public.chat_notification_prefs ADD CONSTRAINT chat_notification_prefs_kind_check
    CHECK (kind = ANY (ARRAY['channel'::text, 'dm'::text, 'group'::text, 'order'::text, 'order_alert'::text]));;
