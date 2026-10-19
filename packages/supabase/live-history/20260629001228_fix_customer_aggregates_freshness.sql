CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_customer_agg_tenant_phone
    ON public.mv_customer_aggregates (tenant_id, customer_phone);

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
END$$;;
