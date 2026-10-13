-- Recorded from live schema_migrations; applied 2026-09-10 from branch
-- feat/flagship-template (PR #80, source commit e46b249e, folded there into
-- 20260910120000_loyalty_earn_on_delivery.sql); do not edit.
-- Body below is the exact statement that ran under version 20260910211209.

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
$$;
