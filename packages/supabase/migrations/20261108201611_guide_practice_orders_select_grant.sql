-- The app reads orders through column grants (see
-- 20261021090000_orders_margin_column_privileges.sql); the practice mark is
-- readable like is_test, so the Orders page can show its stamp.
GRANT SELECT (guide_practice) ON public.orders TO authenticated;
