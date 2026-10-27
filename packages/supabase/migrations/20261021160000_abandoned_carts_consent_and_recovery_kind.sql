-- =============================================
-- FEATURE: PDP order safety net, piece 3: consented phone capture
--
-- Additive only. abandoned_carts keeps its RLS exactly as created in
-- 20260621120000_abandoned_carts.sql (member SELECT; writes service-role
-- only).
--
--   consent_at / consent_text_version: set by the storefront capture
--     endpoint when the buyer typed their phone with the merchant's consent
--     line on screen. The version is "sha256:" + 16 hex of the exact line
--     shown, so it can be matched against the store config revision that
--     rendered it. Both or neither (CHECK below).
--   recovery_kind: how a recovered capture came back. It is derived from the
--     two timestamps the app already writes: 'after_reminder' when a reminder
--     went out before the order, else 'organic'. No writer can get it wrong.
-- =============================================

ALTER TABLE public.abandoned_carts
    ADD COLUMN IF NOT EXISTS consent_at timestamptz,
    ADD COLUMN IF NOT EXISTS consent_text_version text;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'public.abandoned_carts'::regclass
          AND conname = 'abandoned_carts_consent_pair'
    ) THEN
        ALTER TABLE public.abandoned_carts
            ADD CONSTRAINT abandoned_carts_consent_pair
            CHECK ((consent_at IS NULL) = (consent_text_version IS NULL));
    END IF;
END $$;

ALTER TABLE public.abandoned_carts
    ADD COLUMN IF NOT EXISTS recovery_kind text
    GENERATED ALWAYS AS (
        CASE
            WHEN recovered_at IS NULL THEN NULL
            WHEN reminded_at IS NOT NULL AND reminded_at <= recovered_at THEN 'after_reminder'
            ELSE 'organic'
        END
    ) STORED;

-- The orders «متروكة» worklist reads a tenant's open captures, newest first.
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_tenant_open
    ON public.abandoned_carts (tenant_id, updated_at DESC)
    WHERE recovered_at IS NULL;

COMMENT ON COLUMN public.abandoned_carts.consent_at IS
    'When the buyer typed this phone with the WhatsApp consent line shown. NULL = no consent: staff may call; no automatic message may be sent.';
COMMENT ON COLUMN public.abandoned_carts.consent_text_version IS
    'sha256:<16 hex> of the exact consent line the buyer saw.';
COMMENT ON COLUMN public.abandoned_carts.recovery_kind IS
    'Derived: after_reminder | organic | NULL (not recovered).';

NOTIFY pgrst, 'reload schema';
