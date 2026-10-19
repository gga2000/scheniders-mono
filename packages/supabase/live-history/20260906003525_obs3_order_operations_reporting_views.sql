-- OBS-3 (revised) — expose the operational metrics the data can already answer.
--
-- CORRECTION TO THE AUDIT FINDING. OBS-3 claimed the business "cannot answer
-- orders-confirmed-per-agent-per-day, time-to-confirm, or shipping failure
-- rate". Checked against live data, two of those were wrong:
--   * order_status_history holds 75,820 rows spanning ~9 months, 73,594 of them
--     (97%) with an actor, including 14,098 of 14,405 confirmations. Both
--     per-agent throughput and time-to-confirm are answerable today — verified:
--     time-to-confirm over 5,259 orders is avg 0.55h, median 0.50h, p95 1.08h.
-- What was missing is that nobody had written the queries, and there was no
-- analytics pipeline. A pipeline is a vendor decision with cost and customer-PII
-- implications, and it is not needed to answer these — so this ships the queries
-- instead.
--
-- STILL A REAL GAP (not addressed here): shipping-submission failure rate is NOT
-- answerable — waseet_api_logs holds 46 rows against 759 orders carrying a
-- waseet_qr_id, so outcomes are not reliably recorded. WhatsApp delivery rate is
-- likewise unlogged. Those need the integrations to record outcomes first, which
-- is a separate change.
--
-- Both views are security_invoker, so RLS on order_status_history and orders
-- applies to the caller exactly as it does elsewhere — a tenant sees only its own
-- rows, and these cannot become a cross-tenant reporting leak.
--
-- DOWN MIGRATION:
--   DROP VIEW IF EXISTS public.v_order_time_to_confirm;
--   DROP VIEW IF EXISTS public.v_order_confirmations_by_agent;

CREATE OR REPLACE VIEW public.v_order_confirmations_by_agent
WITH (security_invoker = true) AS
SELECT h.tenant_id,
       h.changed_by                                        AS agent,
       (timezone('Asia/Baghdad', h.changed_at))::date      AS day,
       count(DISTINCT h.order_id)                          AS orders_confirmed
  FROM public.order_status_history h
 WHERE h.to_status = 'confirmed'
   AND h.changed_by IS NOT NULL
   AND h.changed_by <> ''
 GROUP BY h.tenant_id, h.changed_by, (timezone('Asia/Baghdad', h.changed_at))::date;

COMMENT ON VIEW public.v_order_confirmations_by_agent IS
    'Orders confirmed per agent per day, bucketed on Asia/Baghdad like every other order-page date. security_invoker: RLS applies to the caller.';

CREATE OR REPLACE VIEW public.v_order_time_to_confirm
WITH (security_invoker = true) AS
SELECT o.tenant_id,
       o.id                                                        AS order_id,
       o.created_at,
       fc.confirmed_at,
       extract(epoch FROM (fc.confirmed_at - o.created_at)) / 3600 AS hours_to_confirm
  FROM public.orders o
  JOIN (
        SELECT h.order_id, min(h.changed_at) AS confirmed_at
          FROM public.order_status_history h
         WHERE h.to_status = 'confirmed'
         GROUP BY h.order_id
       ) fc ON fc.order_id = o.id
 -- Guard against clock skew / backfilled history producing negative durations.
 WHERE fc.confirmed_at >= o.created_at;

COMMENT ON VIEW public.v_order_time_to_confirm IS
    'Per-order latency from creation to first confirmation. Aggregate with percentile_cont for median/p95. security_invoker: RLS applies to the caller.';;
