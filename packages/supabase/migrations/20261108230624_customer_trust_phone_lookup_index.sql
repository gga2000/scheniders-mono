-- The order list view (v_orders_with_risk) joins each order to its
-- customer's trust row on normalize_phone(phone). Without an index on that
-- expression Postgres compared every order with every customer of the store
-- (50 orders x 4,751 customers = 237k phone clean-ups, ~2.4 s per page).
CREATE INDEX IF NOT EXISTS idx_customer_trust_tenant_norm_phone
    ON public.customer_trust (tenant_id, public.normalize_phone(phone));
ANALYZE public.customer_trust;
