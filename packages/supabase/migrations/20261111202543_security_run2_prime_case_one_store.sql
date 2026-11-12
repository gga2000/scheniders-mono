-- Security audit run 2: a Prime case belongs to one store.
--
-- Every store ships through one shared Prime account. Receipt numbers can
-- repeat across stores (refund and replacement orders send the per-store
-- sequence number), and Prime hands back the existing case for a repeated
-- receipt. The case id was unique only per store, so store B could save
-- store A's parcel and then get A's delivery statuses, charges and
-- pull-back. Case ids are now unique across all stores; send.ts already
-- reports a clash as "duplicate receipt" instead of saving it.
--
-- Measured before applying: 85 shipments, 85 distinct case ids, 1 store.

ALTER TABLE public.prime_shipments DROP CONSTRAINT prime_shipments_case_unique;
ALTER TABLE public.prime_shipments ADD CONSTRAINT prime_shipments_case_unique UNIQUE (case_id);
-- The unique constraint's index serves case_id lookups (webhook, sync).
DROP INDEX IF EXISTS public.idx_prime_shipments_case;
