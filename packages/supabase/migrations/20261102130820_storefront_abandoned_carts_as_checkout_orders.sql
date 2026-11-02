-- =============================================
-- Store abandoned carts become abandoned-checkout orders (Ali, 2026-11-02)
--
-- Until the move off LightFunnels, every abandoned checkout reached the
-- orders page as an order in status pending_checkout: a full card in the
-- «متروكة» tab, with the abandoned-cart lifecycle (20261027230000), its
-- outcomes, the recovery strip and the 14-day sweep. Phones typed on the
-- store's own order form were kept apart, in abandoned_carts, and shown as
-- a bare list. Ali chose one flow: a store cart becomes the same card.
--
-- How:
--   * abandoned_carts keeps the raw capture, written by the storefront on
--     each beacon. It now also keeps the shopper's name, the area/street
--     they typed and the governorate's label (capture_storefront_cart),
--     and the abandoned-checkout order it became (order_id).
--   * promote_abandoned_carts() turns each open capture that has sat idle
--     for _idle_minutes into a pending_checkout order through
--     create_order_atomic, as the LightFunnels checkout import did, and
--     links it. pg_cron runs it every minute. The idle wait plays the part
--     of LightFunnels' delayed checkout import: a shopper who orders within
--     it never becomes an abandoned cart (the order marks the capture
--     recovered first), so finished orders are not counted as carts that
--     "came back".
--   * Everything after that is the existing lifecycle: the real order's
--     insert resolves the card as "returned" and recovers the capture
--     (orders_abandoned_cart_after_insert), junk phones go to the trash,
--     the sweep expires untouched cards.
--   * A pending_checkout order moves no stock (inv_phase CLOSED) and does
--     not count toward plan usage (only lib/order-service increments it).
--   * Store captures are not trashed for a missing location. The order
--     form asks the phone first, and a valid Iraqi mobile typed there is a
--     lead staff can call; the location rule stays for LightFunnels.
--
-- capture_abandoned_cart stays in place, unused once the storefront calls
-- capture_storefront_cart; dropping it is queued separately.
-- =============================================

ALTER TABLE public.abandoned_carts
    ADD COLUMN IF NOT EXISTS customer_name text
        CONSTRAINT abandoned_carts_customer_name_len CHECK (char_length(customer_name) <= 120),
    ADD COLUMN IF NOT EXISTS city text
        CONSTRAINT abandoned_carts_city_len CHECK (char_length(city) <= 80),
    ADD COLUMN IF NOT EXISTS address text
        CONSTRAINT abandoned_carts_address_len CHECK (char_length(address) <= 300),
    ADD COLUMN IF NOT EXISTS order_id uuid
        REFERENCES public.orders(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.abandoned_carts.order_id IS
    'The pending_checkout order this capture became (promote_abandoned_carts). NULL until promoted; cleared when the capture reopens.';

-- The promotion sweep's scan: open, not yet promoted, oldest first.
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_unpromoted
    ON public.abandoned_carts (updated_at)
    WHERE recovered_at IS NULL AND order_id IS NULL;

-- ---------------------------------------------
-- capture_storefront_cart: capture_abandoned_cart plus the shopper's name,
-- city and address. Same per-(tenant, phone) rules; an open capture keeps
-- an earlier name, city or address when this beacon has none. A capture
-- that reopens after a recovery forgets the order it became.
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.capture_storefront_cart(
    _tenant_id uuid,
    _phone text,
    _items jsonb,
    _subtotal_iqd integer,
    _reopen_after_seconds integer,
    _governorate text DEFAULT NULL,
    _locale text DEFAULT NULL,
    _consent_text_version text DEFAULT NULL,
    _customer_name text DEFAULT NULL,
    _city text DEFAULT NULL,
    _address text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO ''
AS $function$
DECLARE
    _now timestamptz := now();
    _written uuid;
    _name text := NULLIF(btrim(_customer_name), '');
    _town text := NULLIF(btrim(_city), '');
    _addr text := NULLIF(btrim(_address), '');
BEGIN
    IF _tenant_id IS NULL OR _phone IS NULL OR _items IS NULL OR _subtotal_iqd IS NULL THEN
        RAISE EXCEPTION 'capture_storefront_cart: tenant, phone, items and subtotal are required'
            USING ERRCODE = '22004';
    END IF;
    IF _reopen_after_seconds IS NULL OR _reopen_after_seconds <= 0 THEN
        RAISE EXCEPTION 'capture_storefront_cart: _reopen_after_seconds must be positive'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.abandoned_carts AS c (
        tenant_id, phone, items, subtotal_iqd, governorate, locale,
        consent_at, consent_text_version, customer_name, city, address,
        created_at, updated_at
    )
    VALUES (
        _tenant_id, _phone, _items, _subtotal_iqd, _governorate, _locale,
        CASE WHEN _consent_text_version IS NULL THEN NULL ELSE _now END,
        _consent_text_version, _name, _town, _addr,
        _now, _now
    )
    ON CONFLICT (tenant_id, phone) DO UPDATE SET
        items = EXCLUDED.items,
        subtotal_iqd = EXCLUDED.subtotal_iqd,
        updated_at = EXCLUDED.updated_at,
        governorate = CASE
            WHEN c.recovered_at IS NULL THEN coalesce(EXCLUDED.governorate, c.governorate)
            ELSE EXCLUDED.governorate
        END,
        locale = CASE
            WHEN c.recovered_at IS NULL THEN coalesce(EXCLUDED.locale, c.locale)
            ELSE EXCLUDED.locale
        END,
        customer_name = CASE
            WHEN c.recovered_at IS NULL THEN coalesce(EXCLUDED.customer_name, c.customer_name)
            ELSE EXCLUDED.customer_name
        END,
        city = CASE
            WHEN c.recovered_at IS NULL THEN coalesce(EXCLUDED.city, c.city)
            ELSE EXCLUDED.city
        END,
        address = CASE
            WHEN c.recovered_at IS NULL THEN coalesce(EXCLUDED.address, c.address)
            ELSE EXCLUDED.address
        END,
        -- The pair moves together (abandoned_carts_consent_pair).
        consent_at = CASE
            WHEN EXCLUDED.consent_at IS NOT NULL THEN EXCLUDED.consent_at
            WHEN c.recovered_at IS NULL THEN c.consent_at
            ELSE NULL
        END,
        consent_text_version = CASE
            WHEN EXCLUDED.consent_at IS NOT NULL THEN EXCLUDED.consent_text_version
            WHEN c.recovered_at IS NULL THEN c.consent_text_version
            ELSE NULL
        END,
        created_at = CASE WHEN c.recovered_at IS NULL THEN c.created_at ELSE EXCLUDED.created_at END,
        reminded_at = CASE WHEN c.recovered_at IS NULL THEN c.reminded_at ELSE NULL END,
        order_id = CASE WHEN c.recovered_at IS NULL THEN c.order_id ELSE NULL END,
        recovered_at = NULL
    WHERE c.recovered_at IS NULL
       OR c.recovered_at <= _now - make_interval(secs => _reopen_after_seconds)
    RETURNING c.id INTO _written;

    RETURN _written IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.capture_storefront_cart(uuid, text, jsonb, integer, integer, text, text, text, text, text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_storefront_cart(uuid, text, jsonb, integer, integer, text, text, text, text, text, text)
    TO service_role;

-- ---------------------------------------------
-- promote_abandoned_carts: open captures idle for _idle_minutes become
-- pending_checkout orders. Returns how many were linked to an order.
-- ---------------------------------------------
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
            -- Lines as the storefront checkout writes them: the catalogue
            -- name and price the capture already carries, plus the picture,
            -- tag colour and option name the order cards show.
            SELECT coalesce(jsonb_agg(
                       jsonb_build_object(
                           'product_id', line->>'product_id',
                           'variant_id', NULLIF(line->>'variant_id', ''),
                           'name', line->>'name',
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

-- ---------------------------------------------
-- Store captures keep a card without a location (see header). Otherwise
-- the body is 20261027234000's.
-- ---------------------------------------------
CREATE OR REPLACE FUNCTION public.orders_abandoned_cart_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _junk text;
    _real uuid;
BEGIN
    -- Never trust caller-supplied values for these columns.
    NEW.abandoned_cart_at := NULL;
    NEW.abandoned_cart_outcome := NULL;
    NEW.abandoned_cart_resolved_at := NULL;
    NEW.abandoned_cart_resolved_by_name := NULL;
    NEW.abandoned_cart_order_id := NULL;

    IF NEW.status IS DISTINCT FROM 'pending_checkout' OR NEW.tenant_id IS NULL THEN
        RETURN NEW;
    END IF;

    NEW.abandoned_cart_at := coalesce(NEW.created_at, now());
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    _junk := public.abandoned_cart_junk_reason(
        NEW.phone, NEW.governorate_code, NEW.city, NEW.address_details);
    -- A store capture is a phone typed on the store's own form: keep it
    -- without a location, so staff can call and ask.
    IF _junk = 'junk_location' AND NEW.source = 'storefront' THEN
        _junk := NULL;
    END IF;
    IF _junk IS NOT NULL THEN
        NEW.deleted_at := now();
        NEW.abandoned_cart_outcome := _junk;
        NEW.abandoned_cart_resolved_at := now();
        RETURN NEW;
    END IF;

    -- The customer ordered within 24 h of this checkout: it is the leftover
    -- of that order, not a lead. Measured from the checkout's own time, so a
    -- LightFunnels sync importing old checkouts applies the same rule.
    SELECT o.id INTO _real
    FROM public.orders o
    WHERE o.tenant_id = NEW.tenant_id
      AND o.deleted_at IS NULL
      AND public.normalize_phone(o.phone) = public.normalize_phone(NEW.phone)
      AND o.status <> 'pending_checkout'
      AND o.created_at BETWEEN NEW.abandoned_cart_at - interval '24 hours'
                           AND NEW.abandoned_cart_at + interval '24 hours'
    ORDER BY o.created_at DESC
    LIMIT 1;

    IF _real IS NOT NULL THEN
        NEW.deleted_at := now();
        NEW.abandoned_cart_outcome := 'already_ordered';
        NEW.abandoned_cart_resolved_at := now();
        NEW.abandoned_cart_order_id := _real;
    END IF;

    RETURN NEW;
END;
$function$;

-- Every minute: promote store captures idle for 5 minutes.
SELECT cron.schedule(
    'promote-abandoned-carts',
    '* * * * *',
    $$SELECT public.promote_abandoned_carts(5);$$
);
