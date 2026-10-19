-- Backfill follow-up attribution for automated WhatsApp sends made between
-- 2026-10-02 and 2026-10-14, before ca95eb2f taught the dispatcher and the cron
-- to stamp last_followup_*.
--
-- Same rule as the earlier one-off backfill (20260913110000 on
-- feat/notifications-overhaul): an order whose latest successful automated
-- outbound message is on record in whatsapp_logs is attributed to the bot
-- sentinel, at that message's time, with that message's template type.
--
-- Stricter than that run in three ways:
--   * The log row must belong to the order's own tenant (l.tenant_id = o.tenant_id).
--   * The template type must be one the column accepts; nothing is defaulted.
--   * An order is skipped when a later successful outbound message with no
--     automation source exists. Those are manual sends from before the send
--     route recorded its sender, so the last person to message the customer is
--     unknown — stamping the bot's earlier message would credit the wrong sender.
--
-- Only rows where all four columns are still NULL are touched, so re-running is
-- a no-op and no recorded sender is ever overwritten. One statement: the target
-- set is 148 rows (one tenant), well inside the statement timeout with the orders row triggers.
WITH automated AS (
    SELECT DISTINCT ON (l.order_uuid)
           l.order_uuid,
           l.tenant_id,
           l.created_at,
           l.payload->>'templateType' AS template_type
    FROM public.whatsapp_logs l
    WHERE l.direction = 'outbound'
      AND l.status = 'sent'
      AND l.payload->>'source' IN ('dispatch-event', 'dispatch-event-secondary', 'auto_follow_up')
    ORDER BY l.order_uuid, l.created_at DESC
),
target AS (
    SELECT a.*
    FROM automated a
    JOIN public.orders o
      ON o.id = a.order_uuid
     AND o.tenant_id = a.tenant_id
    WHERE o.last_followup_by_name IS NULL
      AND o.last_followup_by_avatar IS NULL
      AND o.last_followup_at IS NULL
      AND o.last_followup_type IS NULL
      AND a.template_type IN ('reminder', 'discount', 'confirmation')
      -- Matched on the order alone: the old manual send route wrote these
      -- rows with a NULL tenant_id, and this predicate only ever excludes.
      AND NOT EXISTS (
          SELECT 1
          FROM public.whatsapp_logs m
          WHERE m.order_uuid = a.order_uuid
            AND m.direction = 'outbound'
            AND m.status = 'sent'
            AND m.created_at > a.created_at
            AND COALESCE(m.payload->>'source', '') NOT IN ('dispatch-event', 'dispatch-event-secondary', 'auto_follow_up')
      )
)
UPDATE public.orders o
SET last_followup_by_name   = 'الإرسال التلقائي',
    last_followup_by_avatar = 'bot',
    last_followup_at        = t.created_at,
    last_followup_type      = t.template_type
FROM target t
WHERE o.id = t.order_uuid
  AND o.tenant_id = t.tenant_id
  AND o.last_followup_by_name IS NULL;
