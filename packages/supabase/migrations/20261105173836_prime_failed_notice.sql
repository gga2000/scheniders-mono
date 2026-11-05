-- When the store's "failed delivery" WhatsApp went to the customer for this
-- parcel (lib/prime/failed-notice). Set before the send, so one failure gets
-- one message. prime_shipments already has RLS scoped to the tenant.
ALTER TABLE public.prime_shipments
    ADD COLUMN IF NOT EXISTS failed_notice_sent_at TIMESTAMPTZ;
