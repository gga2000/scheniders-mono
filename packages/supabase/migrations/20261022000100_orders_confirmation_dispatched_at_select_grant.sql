-- orders.confirmation_dispatched_at readable by `authenticated`.
--
-- 20261021130000 added the column assuming `authenticated` holds table-level
-- SELECT on public.orders, so no grant was needed. 20261021090000 (margin
-- column privileges) replaces that table grant with a column-level grant on
-- every non-margin column that exists when it runs. Replayed in timestamp
-- order, 090000 runs before 130000, so the new column is left ungranted: every
-- signed-in read through ORDER_READ_COLUMNS (which now names it,
-- apps/platform/lib/repositories/order-columns.ts) would be refused with 42501,
-- and packages/supabase/tests/margin_and_tenancy_gaps.sql fails on it.
--
-- Idempotent in every apply order: while the table-level grant still stands
-- this column grant is redundant, and when 090000 later revokes the table
-- grant it re-grants every non-margin column that exists, this one included.
--
-- Not a margin column, so nothing about admin-only masking changes. anon keeps
-- no privilege on orders. RLS is untouched (orders keeps its tenant policies).

GRANT SELECT (confirmation_dispatched_at) ON public.orders TO authenticated;
