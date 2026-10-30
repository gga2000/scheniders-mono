-- Link the last two replacement orders left out of 20261028170000 (Ali OK'd
-- 2026-10-30). Their phones are the same number in two formats
-- (07... vs +9647...), which the earlier exact-match check rejected.
SET LOCAL lock_timeout = '3s';

UPDATE public.orders c
   SET original_order_id = p.id
  FROM public.orders p, public.tenants t
 WHERE t.slug = 'scheniders-iraq'
   AND c.tenant_id = t.id AND p.tenant_id = t.id
   AND c.original_order_id IS NULL
   AND (c.order_id, p.order_id) IN (('RPL-2926-1', '7073'), ('RPL-3496-1', '7366'));
