CREATE OR REPLACE FUNCTION increment_usage_tracking(
    _tenant_id uuid,
    _year int,
    _month int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO usage_tracking (tenant_id, year, month, orders_count, orders_charged, last_updated_at)
    VALUES (_tenant_id, _year, _month, 1, 1, now())
    ON CONFLICT (tenant_id, year, month)
    DO UPDATE SET
        orders_count = usage_tracking.orders_count + 1,
        orders_charged = usage_tracking.orders_charged + 1,
        last_updated_at = now();
END;
$$;
