-- Prime status updates as they happen (POST /api/prime/webhook).
--
-- Prime calls the app when a parcel's status changes. The call only names
-- the case: the app reads the case's status from Prime and applies it with
-- the same rules as the 15-minute read (lib/prime/sync).
--
-- delivery_unannounced: a parcel moved to delivered whose "delivered" line
-- has not gone out yet. Deliveries arrive one by one through the webhook, so
-- the line is written by the 5-minute run for everything delivered since,
-- as one notice ("12 orders delivered"), not one push per parcel.
--
-- return_reason / postpone_reason / postponed_to: what Prime's update says
-- about a parcel coming back or put off. Prime sends these only on the
-- update; its status read has no such fields. Service role writes them;
-- members read them with the rest of the row (existing policy).

ALTER TABLE public.prime_shipments
    ADD COLUMN IF NOT EXISTS delivery_unannounced BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS return_reason TEXT CHECK (return_reason IS NULL OR length(return_reason) <= 500),
    ADD COLUMN IF NOT EXISTS postpone_reason TEXT CHECK (postpone_reason IS NULL OR length(postpone_reason) <= 500),
    ADD COLUMN IF NOT EXISTS postponed_to TEXT CHECK (postponed_to IS NULL OR length(postponed_to) <= 40);

-- The webhook names a case only; it finds the row (and its tenant) by it.
CREATE INDEX IF NOT EXISTS idx_prime_shipments_case
    ON public.prime_shipments (case_id);

-- The 5-minute run reads only the few rows still waiting to be announced.
CREATE INDEX IF NOT EXISTS idx_prime_shipments_unannounced
    ON public.prime_shipments (tenant_id)
    WHERE delivery_unannounced;
