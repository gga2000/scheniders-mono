CREATE OR REPLACE VIEW public.v_whatsapp_delivery_rate
WITH (security_invoker = true) AS
SELECT l.tenant_id,
       (timezone('Asia/Baghdad', l.created_at))::date            AS day,
       count(*) FILTER (WHERE l.status = 'sent')                 AS sent,
       count(*) FILTER (WHERE l.status = 'delivered')            AS delivered,
       count(*) FILTER (WHERE l.status = 'read')                 AS read,
       count(*) FILTER (WHERE l.status = 'failed')               AS failed,
       max(l.created_at) FILTER (WHERE l.direction = 'status_update') AS last_receipt_at
  FROM public.whatsapp_logs l
 GROUP BY l.tenant_id, (timezone('Asia/Baghdad', l.created_at))::date;

COMMENT ON VIEW public.v_whatsapp_delivery_rate IS
  'WhatsApp sends and delivery receipts per tenant per day, bucketed on Asia/Baghdad. A NULL last_receipt_at means receipts were not recorded that day, not that none arrived. security_invoker: RLS applies to the caller. See OBS-3.';

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
  'One row per outbound WhatsApp message with the receipts that followed it. Covers messages sent after the message-id fix; earlier rows carry no id and appear only in v_whatsapp_delivery_rate. security_invoker: RLS applies to the caller. See OBS-3.';;
