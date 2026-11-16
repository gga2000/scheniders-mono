-- The shop number as staff read and type it: six digits, the same text the
-- apps show ("#100095").
--
-- A function over the row can be filtered like a column through the API, so
-- the staff console's search can match a shop number by any run of its digits,
-- on every shop. Until now that search ran in the browser, over the page of
-- shops it had loaded, because the API cannot filter a number as text
-- ("display_id::text" does not parse).
--
-- Read-only. The service role only: nothing else needs it.

CREATE OR REPLACE FUNCTION public.merchant_code(shop public.tenants)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT lpad(shop.display_id::text, greatest(6, length(shop.display_id::text)), '0');
$$;

REVOKE ALL ON FUNCTION public.merchant_code(public.tenants) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_code(public.tenants) TO service_role;
