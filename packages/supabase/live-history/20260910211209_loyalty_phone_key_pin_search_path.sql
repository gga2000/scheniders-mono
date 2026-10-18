-- loyalty_phone_key is IMMUTABLE and used inside idx_orders_tenant_phone_key.
-- Its body qualifies public.normalize_phone, but the `~` operator and `||`
-- resolve through search_path, which a caller controls — and pg_temp is
-- writable. Pinning it matches every other function this program added.
-- Behaviour is unchanged, so the index stays valid.
CREATE OR REPLACE FUNCTION public.loyalty_phone_key(_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE WHEN n ~ '^7[0-9]{9}$' THEN '0' || n END
  FROM (SELECT public.normalize_phone(_phone) AS n) x;
$$;;
