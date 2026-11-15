-- The hardening migration meant to drop save_qi_card but named its older
-- argument order; the live one (valid_to last) stayed. Cards are now saved only
-- inside settle_qi_payment, in the transaction that credits the paying top-up.
DROP FUNCTION IF EXISTS public.save_qi_card(uuid, text, text, text, timestamptz);
