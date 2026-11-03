-- The COD amount Prime holds for the shipment (shipments-info receiptAmtIqd).
-- It differs from the order's COD after a courier price change
-- (DELIVERED_CHANGE_PRICE), so the difference is on record before the
-- payment statement arrives.
ALTER TABLE public.prime_shipments ADD COLUMN IF NOT EXISTS receipt_amount_iqd BIGINT;

COMMENT ON COLUMN public.prime_shipments.receipt_amount_iqd IS 'COD amount on Prime''s side (whole IQD), as last read from shipments-info.';
