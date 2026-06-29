-- ROOT-CAUSE FIX: customers page was missing ~32% of customers because
-- mv_customer_aggregates went stale (last refresh 2026-06-01).
--
-- Why it was stale:
--   refresh_customer_aggregates() runs `REFRESH MATERIALIZED VIEW CONCURRENTLY`,
--   which REQUIRES a UNIQUE index on the matview — none existed (only non-unique
--   tenant/phone indexes), so every refresh errored. And no pg_cron job was ever
--   scheduled to call it (only the seed-order jobs exist).
--
-- Fix: add the required UNIQUE index, then schedule the refresh every 10 minutes.
-- (tenant_id, customer_phone) is unique in the view — one row per customer/tenant.

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_customer_agg_tenant_phone
    ON public.mv_customer_aggregates (tenant_id, customer_phone);

-- Schedule the refresh (idempotent: drop any prior job of the same name first).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-customer-aggregates') THEN
        PERFORM cron.unschedule('refresh-customer-aggregates');
    END IF;
    PERFORM cron.schedule(
        'refresh-customer-aggregates',
        '*/10 * * * *',
        'SELECT public.refresh_customer_aggregates()'
    );
END$$;
