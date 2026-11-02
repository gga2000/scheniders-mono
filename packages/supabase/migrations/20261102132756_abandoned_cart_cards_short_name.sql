-- =============================================
-- Abandoned-cart cards name products like real orders (Ali, 2026-11-02)
--
-- promote_abandoned_carts (20261102130820) named each line with the
-- storefront's long product name. A real storefront order snapshots the
-- merchant's short ops name (products.short_name, falling back to name;
-- apps/storefront/app/actions/checkout.ts), so the cards read differently
-- from every other order. The function now does the same, and the cards
-- already made are renamed the same way.
-- =============================================

CREATE OR REPLACE FUNCTION public.promote_abandoned_carts(_idle_minutes integer DEFAULT 5)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _cart record;
    _existing uuid;
    _items jsonb;
    _order jsonb;
    _linked integer := 0;
BEGIN
    IF _idle_minutes IS NULL OR _idle_minutes < 1 THEN
        RAISE EXCEPTION 'promote_abandoned_carts: _idle_minutes must be at least 1'
            USING ERRCODE = '22023';
    END IF;

    FOR _cart IN
        SELECT c.*
          FROM public.abandoned_carts c
         WHERE c.recovered_at IS NULL
           AND c.order_id IS NULL
           AND c.updated_at <= now() - make_interval(mins => _idle_minutes)
           AND jsonb_typeof(c.items) = 'array'
           AND jsonb_array_length(c.items) > 0
         ORDER BY c.updated_at
         LIMIT 50
         FOR UPDATE SKIP LOCKED
    LOOP
        -- One live card per phone: a capture whose customer already has an
        -- open abandoned checkout joins it instead of adding a second card.
        SELECT o.id INTO _existing
          FROM public.orders o
         WHERE o.tenant_id = _cart.tenant_id
           AND o.status = 'pending_checkout'
           AND o.deleted_at IS NULL
           AND public.normalize_phone(o.phone) = public.normalize_phone(_cart.phone)
         ORDER BY o.created_at DESC
         LIMIT 1;

        IF _existing IS NULL THEN
            -- Lines as the storefront checkout writes them: the price the
            -- capture already carries, the product's short name, plus the
            -- picture, tag colour and option name the order cards show.
            SELECT coalesce(jsonb_agg(
                       jsonb_build_object(
                           'product_id', line->>'product_id',
                           'variant_id', NULLIF(line->>'variant_id', ''),
                           -- The merchant's ops name, as a real order snapshots it.
                           'name', coalesce(NULLIF(btrim(p.short_name), ''), p.name, line->>'name'),
                           'variant_name', v.name,
                           'quantity', (line->>'quantity')::integer,
                           'price', (line->>'price')::numeric
                       )
                       || CASE WHEN p.image_url IS NOT NULL
                               THEN jsonb_build_object('image_url', p.image_url) ELSE '{}'::jsonb END
                       || CASE WHEN p.tag_color IS NOT NULL
                               THEN jsonb_build_object('tag_color', p.tag_color) ELSE '{}'::jsonb END
                       ORDER BY ord), '[]'::jsonb)
              INTO _items
              FROM jsonb_array_elements(_cart.items) WITH ORDINALITY AS l(line, ord)
              LEFT JOIN public.products p
                     ON p.tenant_id = _cart.tenant_id
                    AND p.id::text = l.line->>'product_id'
              LEFT JOIN public.product_variants v
                     ON v.tenant_id = _cart.tenant_id
                    AND v.id::text = NULLIF(l.line->>'variant_id', '');

            _order := public.create_order_atomic(
                jsonb_build_object(
                    -- orders.customer_name is required; a shopper who left
                    -- before typing a name is shown as such.
                    'customer_name', coalesce(_cart.customer_name, 'بدون اسم'),
                    'phone', _cart.phone,
                    'governorate_code', _cart.governorate,
                    'city', _cart.city,
                    'address_details', _cart.address,
                    'items', _items,
                    'price', _cart.subtotal_iqd,
                    'status', 'pending_checkout',
                    'payment_status', 'cod',
                    'priority', 'normal',
                    'source', 'storefront',
                    'notes', '[سلة متروكة]'
                ),
                _cart.tenant_id
            );
            _existing := (_order->>'id')::uuid;
        END IF;

        UPDATE public.abandoned_carts SET order_id = _existing WHERE id = _cart.id;
        _linked := _linked + 1;
    END LOOP;

    RETURN _linked;
END;
$function$;

REVOKE ALL ON FUNCTION public.promote_abandoned_carts(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_abandoned_carts(integer) TO service_role;

-- The cards already made: same rule, only open store abandoned checkouts
-- that a capture became.
UPDATE public.orders o
   SET items = (
        SELECT jsonb_agg(
                   CASE WHEN p.id IS NULL THEN item
                        ELSE jsonb_set(item, '{name}',
                             to_jsonb(coalesce(NULLIF(btrim(p.short_name), ''), p.name)))
                   END
                   ORDER BY ord)
          FROM jsonb_array_elements(o.items) WITH ORDINALITY AS i(item, ord)
          LEFT JOIN public.products p
                 ON p.tenant_id = o.tenant_id
                AND p.id::text = i.item->>'product_id'
       )
 WHERE o.status = 'pending_checkout'
   AND o.source = 'storefront'
   AND jsonb_typeof(o.items) = 'array'
   AND EXISTS (SELECT 1 FROM public.abandoned_carts c WHERE c.order_id = o.id);
