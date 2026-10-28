-- =============================================
-- v_orders_with_risk: expose the abandoned_cart_* columns
--
-- The order details modal reads this view (orderRepository.findById), and a
-- view's column list is fixed when it is created, so the columns added by
-- 20261027230000_abandoned_cart_lifecycle are appended here. The existing
-- columns, their order, the margin masking and the WHERE are unchanged
-- (copied from pg_get_viewdef on 2026-10-27); CREATE OR REPLACE VIEW only
-- allows appending, which is all this does. security_invoker stays on, so
-- orders RLS and column grants still decide what a member reads.
-- =============================================

CREATE OR REPLACE VIEW public.v_orders_with_risk
WITH (security_invoker = true) AS
 SELECT o.id,
    o.created_at,
    o.updated_at,
    o.order_id,
    o.customer_name,
    o.phone,
    o.city,
    o.governorate_code,
    o.address_details,
    o.items,
    o.price,
    o.status,
    o.whatsapp_link,
    o.notes,
    o.rejection_reason,
    o.scheduled_date,
    o.priority,
    o.payment_status,
    o.delivery_fee,
    o.discount_amount,
    o.is_return,
    o.original_order_id,
    o.is_archived,
    o.secondary_phone,
    o.delivery_slot,
    o.source,
    o.sequence_number,
    o.delivered_at,
    o.cancelled_at,
    o.printed_at,
    o.print_count,
    o.last_batch_id,
    o.is_gift,
    o.tag_color,
    o.is_pinned,
    o.delivery_order_id,
    o.is_reviewed,
    o.is_verified_customer,
    o.contact_count,
    o.address_status,
    o.address_issues,
    o.validated_governorate_code,
    o.internal_notes,
    o.assigned_to,
    o.assigned_at,
        CASE
            WHEN is_tenant_admin(o.tenant_id) THEN ( SELECT m.product_cost
               FROM order_margin(o.id) m(product_cost, net_profit, waseet_merchant_price, waseet_company_price))
            ELSE NULL::numeric
        END AS product_cost,
        CASE
            WHEN is_tenant_admin(o.tenant_id) THEN ( SELECT m.net_profit
               FROM order_margin(o.id) m(product_cost, net_profit, waseet_merchant_price, waseet_company_price))
            ELSE NULL::numeric
        END AS net_profit,
    o.is_shop_order,
    o.risk_metadata,
    o.needs_attention,
    o.attention_reasons,
    o.original_created_at,
    o.last_contacted_at,
    o.last_status_changed_by_name,
    o.last_status_changed_by_avatar,
    o.is_test,
    o.delivery_note,
    o.is_replacement,
    o.delivery_company,
    o.waseet_qr_id,
    o.waseet_qr_link,
    o.waseet_status_id,
    o.waseet_status_text,
        CASE
            WHEN is_tenant_admin(o.tenant_id) THEN ( SELECT m.waseet_merchant_price
               FROM order_margin(o.id) m(product_cost, net_profit, waseet_merchant_price, waseet_company_price))
            ELSE NULL::numeric
        END AS waseet_merchant_price,
        CASE
            WHEN is_tenant_admin(o.tenant_id) THEN ( SELECT m.waseet_company_price
               FROM order_margin(o.id) m(product_cost, net_profit, waseet_merchant_price, waseet_company_price))
            ELSE NULL::numeric
        END AS waseet_company_price,
    o.waseet_submitted_at,
    o.waseet_invoice_id,
    o.completed_at,
    o.version,
    o.tenant_id,
    o.refund_status,
    o.refunded_at,
    o.delivered_source,
    o.reason_id,
    o.deleted_at,
    COALESCE(jsonb_build_object('level',
        CASE ct.trust_tier
            WHEN 'risky'::text THEN 'high'::text
            WHEN 'watch'::text THEN 'medium'::text
            ELSE 'low'::text
        END, 'score', ct.trust_score, 'tier', ct.trust_tier, 'reasons', '[]'::jsonb, 'isBlacklisted', false, 'deliverySuccessRate', ct.delivery_success_rate, 'communityAvgRating', ct.community_avg_rating, 'communityRatingCount', ct.community_rating_count, 'historicalData', jsonb_build_object('totalOrders', ct.total_orders, 'deliveredCount', ct.delivered_count, 'cancelledCustomerCount', ct.cancelled_customer_count, 'cancelledMerchantCount', ct.cancelled_merchant_count, 'rejectedCustomerFaultCount', ct.rejected_customer_fault_count, 'rejectedMerchantFaultCount', ct.rejected_merchant_fault_count, 'rejectedAmbiguousCount', ct.rejected_ambiguous_count, 'rejectedCount', ct.rejected_customer_fault_count, 'cancelledCount', ct.cancelled_customer_count, 'noResponseCount', ct.no_response_count, 'refundCount', ct.refund_count)), jsonb_build_object('level', 'low', 'score', 0, 'reasons', '[]'::jsonb, 'isBlacklisted', false, 'historicalData', NULL::jsonb)) AS risk_data,
    o.whatsapp_contact_slot,
    o.last_followup_by_name,
    o.last_followup_by_avatar,
    o.last_followup_at,
    o.last_followup_type,
    o.abandoned_cart_at,
    o.abandoned_cart_outcome,
    o.abandoned_cart_resolved_at,
    o.abandoned_cart_resolved_by_name,
    o.abandoned_cart_order_id
   FROM (orders o
     LEFT JOIN customer_trust ct ON (((normalize_phone(COALESCE(o.phone, ''::text)) = normalize_phone(ct.phone)) AND (ct.tenant_id = o.tenant_id))))
  WHERE (o.deleted_at IS NULL);

NOTIFY pgrst, 'reload schema';
