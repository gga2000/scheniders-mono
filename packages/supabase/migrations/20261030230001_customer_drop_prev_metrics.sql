-- Drops mv_customer_metrics_prev, the pre-20261030225257 copy left by that
-- migration's rename swap. Nothing reads or refreshes it. Run from the SQL
-- editor (the MCP cannot run DROP).

DROP MATERIALIZED VIEW public.mv_customer_metrics_prev;