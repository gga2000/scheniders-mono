-- Who sent the failed-delivery WhatsApp by hand (orders «معالجة» / Prime
-- problems tab button). Null with failed_notice_sent_at set means the app
-- sent it automatically. prime_shipments already has RLS scoped to the tenant.
ALTER TABLE public.prime_shipments
    ADD COLUMN IF NOT EXISTS failed_notice_sent_by TEXT;