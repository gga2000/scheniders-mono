-- Customers page cleanup that needs DROP (run from the SQL editor).
--
--   * customer_links had UNIQUE (phone_a, phone_b) across every store, so one
--     store linking two customers stopped any other store from linking the same
--     pair. The key is now per store.
--   * get_customer_orders(text) never worked for app users (it returned
--     columns they may not read) and is replaced by get_customer_order_history.
--   * mv_customer_aggregates is no longer read or refreshed since
--     20261030082958 (replaced by mv_customer_metrics); it only takes space.
--   * mv_customer_metrics_old is the pre-20261030173528 copy left by that
--     migration's rename swap; nothing reads or refreshes it.

ALTER TABLE public.customer_links DROP CONSTRAINT customer_links_phone_a_phone_b_key;
ALTER TABLE public.customer_links
    ADD CONSTRAINT customer_links_tenant_pair_key UNIQUE (tenant_id, phone_a, phone_b);

DROP FUNCTION public.get_customer_orders(text);

DROP MATERIALIZED VIEW public.mv_customer_aggregates;

DROP MATERIALIZED VIEW public.mv_customer_metrics_old;