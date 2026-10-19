DROP VIEW IF EXISTS public.v_orders_with_risk;
DROP TRIGGER IF EXISTS trg_chat_orders_event ON public.orders;

ALTER TABLE public.orders
  ALTER COLUMN delivered_at TYPE timestamptz USING delivered_at AT TIME ZONE 'UTC',
  ALTER COLUMN cancelled_at TYPE timestamptz USING cancelled_at AT TIME ZONE 'UTC';

CREATE TRIGGER trg_chat_orders_event
  AFTER UPDATE OF status, assigned_to, delivered_at ON public.orders
  FOR EACH ROW EXECUTE FUNCTION chat_orders_event();

CREATE VIEW public.v_orders_with_risk
WITH (security_invoker = true) AS
 SELECT o.id, o.created_at, o.updated_at, o.order_id, o.customer_name, o.phone,
    o.city, o.governorate_code, o.address_details, o.items, o.price, o.status,
    o.whatsapp_link, o.notes, o.rejection_reason, o.scheduled_date, o.priority,
    o.payment_status, o.delivery_fee, o.discount_amount, o.is_return,
    o.original_order_id, o.is_archived, o.secondary_phone, o.delivery_slot,
    o.source, o.sequence_number, o.delivered_at, o.cancelled_at, o.printed_at,
    o.print_count, o.last_batch_id, o.is_gift, o.tag_color, o.is_pinned,
    o.delivery_order_id, o.is_reviewed, o.is_verified_customer, o.contact_count,
    o.address_status, o.address_issues, o.validated_governorate_code,
    o.internal_notes, o.assigned_to, o.assigned_at, o.product_cost, o.net_profit,
    o.is_shop_order, o.risk_metadata, o.needs_attention, o.attention_reasons,
    o.original_created_at, o.last_contacted_at, o.last_status_changed_by_name,
    o.last_status_changed_by_avatar, o.is_test, o.delivery_note, o.is_replacement,
    o.delivery_company, o.waseet_qr_id, o.waseet_qr_link, o.waseet_status_id,
    o.waseet_status_text, o.waseet_merchant_price, o.waseet_company_price,
    o.waseet_submitted_at, o.waseet_invoice_id, o.completed_at, o.version,
    o.tenant_id, o.refund_status, o.refunded_at, o.delivered_source, o.reason_id,
    o.deleted_at,
    COALESCE(
      jsonb_build_object('level', cr.risk_level, 'score', cr.score, 'reasons', cr.reasons,
        'isBlacklisted', cr.risk_level = 'blocked'::text,
        'historicalData', jsonb_build_object(
          'totalOrders', (cr.stats ->> 'total'::text)::numeric,
          'rejectedCount', (cr.stats ->> 'rejected'::text)::numeric,
          'cancelledCount', (cr.stats ->> 'cancelled'::text)::numeric,
          'noResponseCount', (cr.stats ->> 'no_response'::text)::numeric)),
      jsonb_build_object('level', 'low', 'score', 0, 'reasons', '[]'::jsonb,
        'isBlacklisted', false, 'historicalData', NULL::unknown)) AS risk_data
   FROM orders o
     LEFT JOIN customer_risk cr
       ON normalize_phone(COALESCE(o.phone, ''::text)) = cr.phone
      AND cr.tenant_id = o.tenant_id
  WHERE o.deleted_at IS NULL;

GRANT ALL ON TABLE public.v_orders_with_risk TO anon;
GRANT ALL ON TABLE public.v_orders_with_risk TO authenticated;
GRANT ALL ON TABLE public.v_orders_with_risk TO service_role;
GRANT ALL ON TABLE public.v_orders_with_risk TO postgres;;
