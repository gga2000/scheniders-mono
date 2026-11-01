-- Storefront checkout snapshotted order lines without image_url / tag_color,
-- so the orders page drew a blank box for every website order (every other
-- source snapshots both from products). The checkout now records them; this
-- fills the lines placed before that fix.
--
-- Scope: scheniders-iraq only (the only tenant with storefront orders missing
-- them on 2026-11-01: 3 orders). Each line takes its own product's values,
-- read from the same tenant. Lines that already carry image_url are left
-- as they are, so re-running is a no-op.
--
-- Side effects of touching orders.items: inv_order_changed releases and
-- re-reserves the same lines (net zero), and log_order_update_notifications
-- records one "order edited" notification per order.

WITH lines AS (
  SELECT o.id,
         jsonb_agg(
           CASE
             WHEN e.item ? 'image_url' OR p.id IS NULL THEN e.item
             ELSE e.item
                  || CASE WHEN p.image_url IS NOT NULL AND p.image_url <> ''
                          THEN jsonb_build_object('image_url', p.image_url) ELSE '{}'::jsonb END
                  || CASE WHEN p.tag_color IS NOT NULL AND p.tag_color <> '' AND NOT e.item ? 'tag_color'
                          THEN jsonb_build_object('tag_color', p.tag_color) ELSE '{}'::jsonb END
           END
           ORDER BY e.ord
         ) AS items
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(o.items) WITH ORDINALITY AS e(item, ord)
  LEFT JOIN public.products p
         ON p.id::text = e.item->>'product_id'
        AND p.tenant_id = o.tenant_id
  WHERE o.tenant_id = 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'
    AND o.source = 'storefront'
    AND jsonb_typeof(o.items) = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements(o.items) x WHERE NOT x ? 'image_url')
  GROUP BY o.id
)
UPDATE public.orders o
SET items = lines.items
FROM lines
WHERE o.id = lines.id
  AND o.items IS DISTINCT FROM lines.items;
