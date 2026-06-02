-- Add recipient_type to public.whatsapp_logs to match old project's schema.
-- Old has CHECK recipient_type IN ('customer','staff') — distinguishes customer
-- notifications (order confirmations, reminders) from staff alerts.

ALTER TABLE public.whatsapp_logs
  ADD COLUMN IF NOT EXISTS recipient_type text
  CHECK (recipient_type IS NULL OR recipient_type IN ('customer','staff'));

COMMENT ON COLUMN public.whatsapp_logs.recipient_type IS
  'Who received the WhatsApp message: customer (order confirmations / reminders) or staff (alerts).';
