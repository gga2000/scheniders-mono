-- The admin bell asks every minute whether the platform's Interakt wallet is
-- empty: the newest refused and the newest sent outbound message. One index
-- answers both without reading the whole log as it grows.
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_outbound_status_created
    ON public.whatsapp_logs (status, created_at DESC)
 WHERE direction = 'outbound';
