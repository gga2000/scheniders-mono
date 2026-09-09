-- ORD-N1 — the entire customer-risk signal was dead product-wide.
--
-- `v_orders_with_risk` joined `customer_risk`, which has ZERO rows across all 12
-- tenants and 22,818 orders. Nothing writes it any more: the trigger on `orders`
-- calls `calculate_customer_trust()`, which writes `customer_trust` (3,381 rows).
-- The pipeline was migrated to the new table and the view was never repointed.
--
-- Because `jsonb_build_object('level', cr.risk_level, ...)` is NOT NULL when its
-- inputs are null, the COALESCE fallback never fired either — every order carried a
-- risk_data object full of nulls, every customer read as "low" risk, and the
-- order-card badges for prior rejections, refunds and no-response could never render
-- for anyone. Found while typing swipeable-order-card: the `any` index signature had
-- been hiding the shape mismatch.
--
-- Restored on the audited tenant, from zero:
--   642 orders show a no-response history · 109 prior rejections · 133 prior refunds
--   · 69 orders carry an elevated risk level
--
-- Old keys are preserved (level, score, reasons, isBlacklisted, historicalData.
-- {totalOrders, rejectedCount, cancelledCount, noResponseCount}); the TrustAssessment
-- fields the UI expects are added alongside. `isBlacklisted` stays false — the
-- blacklist is a separate table the page reads through its own prop.
--
-- Patched in place: the view deliberately excludes 2 of the 77 order columns, so its
-- column list must not be retyped. security_invoker=true is re-asserted after.
-- Verified after apply: 76 columns, security_invoker kept, tenant isolation returns
-- exactly 1 tenant for a member.
--
-- DOWN MIGRATION: re-point the join to `customer_risk` and restore the previous
-- risk_data expression.
DO $mig$
DECLARE
  src text; head text; tail text; expr_start int; expr_end int;
  new_expr text := 'COALESCE(jsonb_build_object(
        ''level'', CASE ct.trust_tier WHEN ''risky'' THEN ''high'' WHEN ''watch'' THEN ''medium'' ELSE ''low'' END,
        ''score'', ct.trust_score,
        ''tier'', ct.trust_tier,
        ''reasons'', ''[]''::jsonb,
        ''isBlacklisted'', false,
        ''deliverySuccessRate'', ct.delivery_success_rate,
        ''communityAvgRating'', ct.community_avg_rating,
        ''communityRatingCount'', ct.community_rating_count,
        ''historicalData'', jsonb_build_object(
            ''totalOrders'', ct.total_orders,
            ''deliveredCount'', ct.delivered_count,
            ''cancelledCustomerCount'', ct.cancelled_customer_count,
            ''cancelledMerchantCount'', ct.cancelled_merchant_count,
            ''rejectedCustomerFaultCount'', ct.rejected_customer_fault_count,
            ''rejectedMerchantFaultCount'', ct.rejected_merchant_fault_count,
            ''rejectedAmbiguousCount'', ct.rejected_ambiguous_count,
            ''rejectedCount'', ct.rejected_customer_fault_count,
            ''cancelledCount'', ct.cancelled_customer_count,
            ''noResponseCount'', ct.no_response_count,
            ''refundCount'', ct.refund_count)),
      jsonb_build_object(''level'', ''low'', ''score'', 0, ''reasons'', ''[]''::jsonb,
                         ''isBlacklisted'', false, ''historicalData'', NULL::jsonb)) AS risk_data';
BEGIN
  src := pg_get_viewdef('public.v_orders_with_risk', true);
  expr_start := position('COALESCE(jsonb_build_object(''level'', cr.risk_level' in src);
  expr_end   := position(' AS risk_data' in src) + length(' AS risk_data');
  IF expr_start = 0 OR expr_end <= expr_start THEN
    RAISE EXCEPTION 'ORD-N1 aborted: risk_data expression not located in the live view';
  END IF;
  head := substring(src from 1 for expr_start - 1);
  tail := substring(src from expr_end);
  src  := head || new_expr || tail;
  IF position('LEFT JOIN customer_risk cr' in src) = 0 THEN
    RAISE EXCEPTION 'ORD-N1 aborted: customer_risk join not located';
  END IF;
  src := replace(src,
    'LEFT JOIN customer_risk cr ON normalize_phone(COALESCE(o.phone, ''''::text)) = cr.phone AND cr.tenant_id = o.tenant_id',
    'LEFT JOIN customer_trust ct ON normalize_phone(COALESCE(o.phone, ''''::text)) = normalize_phone(ct.phone) AND ct.tenant_id = o.tenant_id');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_orders_with_risk AS ' || src;
  EXECUTE 'ALTER VIEW public.v_orders_with_risk SET (security_invoker = true)';
END
$mig$;
