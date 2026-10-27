-- =============================================
-- FEATURE: PDP order safety net, piece 3: one atomic write per phone capture
--
-- Additive only: a new function. No table, column, constraint or RLS change.
--
-- The storefront capture endpoint (apps/storefront/app/api/cart/abandoned)
-- used a plain PostgREST upsert on (tenant_id, phone). That left
-- recovered_at untouched, so once a phone had ordered at a store every later
-- capture from it was written onto a row the «متروكة» worklist, the reminder
-- sweep and idx_abandoned_carts_tenant_open all skip (they read
-- recovered_at IS NULL), and the old recovery's items and subtotal were
-- overwritten with the new, unbought cart.
--
-- capture_abandoned_cart decides, in one INSERT … ON CONFLICT statement,
-- what a capture does to the (tenant, phone) row:
--   * no row: insert an open capture.
--   * open row (recovered_at IS NULL): refresh items, subtotal and
--     updated_at. Governorate and locale keep their earlier value when this
--     capture has none (the cart beacon sends no governorate until one is
--     picked). reminded_at is kept, so a beacon never re-arms a reminder.
--     Consent is kept unless this capture brings it again.
--   * recovered within _reopen_after_seconds: left exactly as it is. That is
--     a late beacon from the order that just recovered it.
--   * recovered longer ago: a new episode. The row starts again as a fresh
--     open capture: recovered_at, reminded_at and the old consent are
--     cleared, created_at is reset. Consent belongs to the capture it was
--     given with (the line reads "about your order"), so it is not carried
--     into a new one. The earlier recovery stops being counted, because the
--     table keeps one row per (tenant, phone).
--
-- Returns true when a row was written, false when a recent recovery was
-- kept. SECURITY INVOKER and executable by service_role only: the endpoint
-- resolves the tenant from the request host and calls this with the
-- service role, which is what bypasses RLS for the write.
-- =============================================

CREATE OR REPLACE FUNCTION public.capture_abandoned_cart(
    _tenant_id uuid,
    _phone text,
    _items jsonb,
    _subtotal_iqd integer,
    _reopen_after_seconds integer,
    _governorate text DEFAULT NULL,
    _locale text DEFAULT NULL,
    _consent_text_version text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    _now timestamptz := now();
    _written uuid;
BEGIN
    IF _tenant_id IS NULL OR _phone IS NULL OR _items IS NULL OR _subtotal_iqd IS NULL THEN
        RAISE EXCEPTION 'capture_abandoned_cart: tenant, phone, items and subtotal are required'
            USING ERRCODE = '22004';
    END IF;
    IF _reopen_after_seconds IS NULL OR _reopen_after_seconds <= 0 THEN
        RAISE EXCEPTION 'capture_abandoned_cart: _reopen_after_seconds must be positive'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.abandoned_carts AS c (
        tenant_id, phone, items, subtotal_iqd, governorate, locale,
        consent_at, consent_text_version, created_at, updated_at
    )
    VALUES (
        _tenant_id, _phone, _items, _subtotal_iqd, _governorate, _locale,
        CASE WHEN _consent_text_version IS NULL THEN NULL ELSE _now END,
        _consent_text_version, _now, _now
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
        recovered_at = NULL
    WHERE c.recovered_at IS NULL
       OR c.recovered_at <= _now - make_interval(secs => _reopen_after_seconds)
    RETURNING c.id INTO _written;

    RETURN _written IS NOT NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.capture_abandoned_cart(uuid, text, jsonb, integer, integer, text, text, text)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_abandoned_cart(uuid, text, jsonb, integer, integer, text, text, text)
    TO service_role;

COMMENT ON FUNCTION public.capture_abandoned_cart(uuid, text, jsonb, integer, integer, text, text, text) IS
    'Storefront phone capture: insert, refresh an open capture, keep a recovery younger than _reopen_after_seconds, or reopen an older one as a fresh capture. Service role only.';

NOTIFY pgrst, 'reload schema';
