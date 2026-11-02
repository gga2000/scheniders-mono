-- orders.reviewed_at / reviewed_by readable by `authenticated`.
--
-- 20261102031800 added both columns; `authenticated` holds column-level SELECT
-- on orders (20261021090000 margin column privileges), so new columns need
-- their own grant or every read through ORDER_READ_COLUMNS
-- (apps/platform/lib/repositories/order-columns.ts) is refused with 42501.
-- Not margin columns. anon keeps no privilege on orders. RLS is untouched.

GRANT SELECT (reviewed_at, reviewed_by) ON public.orders TO authenticated;
