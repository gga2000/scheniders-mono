-- Retire the legacy chat notification table and the chat push URL.
--
-- Since chat_send_message began writing `notifications` directly
-- (20260916090000), chat_notifications has had no writers, no triggers, and its
-- newest row is from 2026-09-11. All 8 rows it still held were verified present
-- in `notifications` under the same ids before this dropped anything.
--
-- `chat_push_config.function_url` pointed at the send-chat-push edge function,
-- which the dispatcher replaced — chat push now goes through the same
-- send-order-push sender as every other category, so it honours the
-- per-category preferences, quiet hours, mutes and DND that the chat-only path
-- never consulted. Clearing the column makes that unambiguous: there is one
-- sender, named by order_function_url. The edge function itself is deleted.

DROP TABLE IF EXISTS public.chat_notifications;

UPDATE public.chat_push_config SET function_url = NULL WHERE id = 1;

COMMENT ON COLUMN public.chat_push_config.function_url IS
    'Deprecated. Chat push went through send-chat-push until the unified '
    'dispatcher took over; all categories now use order_function_url. Kept as a '
    'column only so older migrations still apply cleanly.';
