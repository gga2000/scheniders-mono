-- OBS-3, the WhatsApp half: make delivery rate answerable.
--
-- Filed as "WhatsApp delivery rate is unlogged". Checked against live data, the
-- outcomes ARE logged — and three separate defects made them useless:
--
--   1. The send path read the provider's message id as `data.message_id`, which
--      Interakt does not send (it returns `id` at the top level). Result:
--      `interakt_message_id` NULL on all 8,862 rows, so a receipt could never be
--      matched to the message it was about.
--   2. The per-tenant webhook endpoint answered `{"message":"Status ... logged"}`
--      and wrote nothing. Receipts stop dead at 2026-06-01 — 170 messages sent
--      since, with zero delivered/read/failed of any kind — which is when
--      traffic moved to that endpoint.
--   3. The shared endpoint did write rows, but stamped every one
--      `template_name = 'cod_order_confirm'` regardless of the real template.
--
-- All three are fixed in the application. These views expose the result, and are
-- deliberately built so the silence is visible rather than being reported as a
-- 0% delivery rate with no explanation: `last_receipt_at` is NULL for every day
-- whose receipts were discarded, which is what a reader needs to see.
--
-- Historic rows (before the fix) carry no message id, so they can be counted but
-- not joined. v_whatsapp_delivery_rate counts, and therefore covers the whole
-- history; v_whatsapp_message_outcomes joins, and covers messages sent from the
-- fix onwards.
--
-- DOWN MIGRATION:
--   DROP VIEW IF EXISTS public.v_whatsapp_message_outcomes;
--   DROP VIEW IF EXISTS public.v_whatsapp_delivery_rate;

CREATE OR REPLACE VIEW public.v_whatsapp_delivery_rate
WITH (security_invoker = true) AS
SELECT l.tenant_id,
       (timezone('Asia/Baghdad', l.created_at))::date            AS day,
       count(*) FILTER (WHERE l.status = 'sent')                 AS sent,
       count(*) FILTER (WHERE l.status = 'delivered')            AS delivered,
       count(*) FILTER (WHERE l.status = 'read')                 AS read,
       count(*) FILTER (WHERE l.status = 'failed')               AS failed,
       -- NULL on any day whose receipts were discarded, which is the signal that
       -- a 0 above means "not recorded", not "nothing was delivered".
       max(l.created_at) FILTER (WHERE l.direction = 'status_update') AS last_receipt_at
  FROM public.whatsapp_logs l
 GROUP BY l.tenant_id, (timezone('Asia/Baghdad', l.created_at))::date;

COMMENT ON VIEW public.v_whatsapp_delivery_rate IS
  'WhatsApp sends and delivery receipts per tenant per day, bucketed on Asia/Baghdad. '
  'A NULL last_receipt_at means receipts were not recorded that day, not that none arrived. '
  'security_invoker: RLS applies to the caller. See OBS-3.';

CREATE OR REPLACE VIEW public.v_whatsapp_message_outcomes
WITH (security_invoker = true) AS
SELECT s.tenant_id,
       s.interakt_message_id                                        AS message_id,
       s.order_uuid,
       s.order_id,
       s.template_name,
       s.created_at                                                 AS sent_at,
       min(r.created_at) FILTER (WHERE r.status = 'delivered')      AS delivered_at,
       min(r.created_at) FILTER (WHERE r.status = 'read')           AS read_at,
       min(r.created_at) FILTER (WHERE r.status = 'failed')         AS failed_at
  FROM public.whatsapp_logs s
  LEFT JOIN public.whatsapp_logs r
         ON r.interakt_message_id = s.interakt_message_id
        AND r.direction = 'status_update'
 WHERE s.direction = 'outbound'
   AND s.interakt_message_id IS NOT NULL
 GROUP BY s.tenant_id, s.interakt_message_id, s.order_uuid, s.order_id,
          s.template_name, s.created_at;

COMMENT ON VIEW public.v_whatsapp_message_outcomes IS
  'One row per outbound WhatsApp message with the receipts that followed it. '
  'Covers messages sent after the message-id fix; earlier rows carry no id and appear only in '
  'v_whatsapp_delivery_rate. security_invoker: RLS applies to the caller. See OBS-3.';
