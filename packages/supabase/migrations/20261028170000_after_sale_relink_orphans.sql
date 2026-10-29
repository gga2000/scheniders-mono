-- After-sale data repair (reviewed by Ali in the replacements thread, 2026-10-28).
-- 1. Relink RTN-/RPL- orders saved without original_order_id while
--    create_order_atomic dropped it (2026-05-25 .. 2026-10-27). Only a child
--    whose number names exactly one order of the same tenant AND whose phone
--    matches that order is linked; every other orphan is left for review.
-- 2. RPL- orders created in that window also lost is_replacement.
-- 3. RTN-3907-1 (scheniders-iraq) was charged -1 stock when it went in_transit
--    under the old trigger; the fixed trigger no longer gives it back, so it is
--    returned here once, with a ledger row.
SET LOCAL lock_timeout = '3s';

WITH orphans AS (
    SELECT o.id, o.tenant_id, o.phone,
           substring(o.order_id FROM '^(?:RTN|RPL)-(.+)-\d+$') AS base
      FROM public.orders o
     WHERE o.original_order_id IS NULL
       AND (o.is_return OR o.is_replacement OR o.order_id LIKE 'RPL-%')
       AND o.order_id ~ '^(RTN|RPL)-.+-\d+$'
), candidates AS (
    SELECT x.id AS child_id, p.id AS original_id, p.phone = x.phone AS phone_ok,
           count(*) OVER (PARTITION BY x.id) AS n
      FROM orphans x
      JOIN public.orders p
        ON p.tenant_id = x.tenant_id AND p.id <> x.id
       AND (p.sequence_number::text = x.base OR p.order_id = x.base)
)
UPDATE public.orders o
   SET original_order_id = c.original_id
  FROM candidates c
 WHERE o.id = c.child_id AND c.n = 1 AND c.phone_ok;

UPDATE public.orders
   SET is_replacement = true
 WHERE order_id LIKE 'RPL-%' AND NOT is_replacement AND NOT is_return;

WITH fix AS (
    SELECT o.id AS order_id, o.tenant_id, l.product_id, l.variant_id, -sum(l.delta_stock)::integer AS qty
      FROM public.orders o
      JOIN public.tenants t ON t.id = o.tenant_id AND t.slug = 'scheniders-iraq'
      JOIN public.inventory_ledger l ON l.order_id = o.id AND l.reason LIKE 'trigger:FULFILLED:%'
     WHERE o.order_id = 'RTN-3907-1' AND o.is_return
     GROUP BY 1, 2, 3, 4
    HAVING sum(l.delta_stock) < 0
), upd AS (
    UPDATE public.products p
       SET stock_quantity = p.stock_quantity + f.qty
      FROM fix f
     WHERE f.variant_id IS NULL AND p.id = f.product_id AND p.tenant_id = f.tenant_id
    RETURNING f.*
)
INSERT INTO public.inventory_ledger(tenant_id, product_id, variant_id, order_id, delta_reserved, delta_stock, delta_open_box, reason)
SELECT tenant_id, product_id, variant_id, order_id, 0, qty, 0, 'correction:return_in_transit'
  FROM upd;
