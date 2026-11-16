-- Fermi B11 items 7 and 9: a new shop proves its owner's mobile with a code
-- sent on WhatsApp before the account is made, and that number gets a welcome
-- message with the store link and a short video.
--
-- signup_phone_codes holds one row per code sent. Only the server (service
-- role) reads or writes it: RLS is on with no policies, and anon and
-- authenticated have no grants. The code itself is never stored, only a hash.
-- A row is used by at most one signup (used_at), which links it to the new
-- shop (tenant_id) and records the welcome message sent to that number.
--
-- tenants.contact_phone_verified_at: when the owner's phone was proven at
-- signup. Null for every shop made before, or while the code is switched off.

CREATE TABLE IF NOT EXISTS public.signup_phone_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    phone text NOT NULL CHECK (phone ~ '^07[0-9]{9}$'),
    code_hash text NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
    ip text,
    attempts smallint NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    message_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    verified_at timestamptz,
    used_at timestamptz,
    tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
    welcome_sent_at timestamptz,
    welcome_message_id text,
    welcome_error text,
    CONSTRAINT signup_phone_codes_used_after_verified CHECK (used_at IS NULL OR verified_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS signup_phone_codes_phone_created_idx
    ON public.signup_phone_codes (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS signup_phone_codes_tenant_idx
    ON public.signup_phone_codes (tenant_id) WHERE tenant_id IS NOT NULL;

ALTER TABLE public.signup_phone_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.signup_phone_codes FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_phone_codes TO service_role;

COMMENT ON TABLE public.signup_phone_codes IS
    'Fermi B11: WhatsApp codes that prove a new shop owner''s mobile at signup, and the welcome message sent after. Server only.';

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS contact_phone_verified_at timestamptz;
COMMENT ON COLUMN public.tenants.contact_phone_verified_at IS
    'When the owner proved contact_phone with a WhatsApp code at signup (Fermi B11). Null when it was never checked.';

-- Checks a code typed for a phone against the newest code sent to it that no
-- signup has used. Five wrong tries lock that code; a new one must be sent.
-- Returns 'ok' with the row id (the proof the signup hands back), or
-- 'wrong', 'locked' or 'expired' with no id. The same right code may be
-- checked again while the proof is unused (a second tap, a reload).
CREATE OR REPLACE FUNCTION public.signup_phone_code_check(p_phone text, p_code_hash text)
RETURNS TABLE (result text, proof uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row public.signup_phone_codes%ROWTYPE;
    c_max_attempts CONSTANT smallint := 5;
BEGIN
    SELECT * INTO v_row
    FROM public.signup_phone_codes
    WHERE phone = p_phone AND used_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND OR (v_row.verified_at IS NULL AND v_row.expires_at <= now()) THEN
        RETURN QUERY SELECT 'expired'::text, NULL::uuid;
        RETURN;
    END IF;

    IF v_row.verified_at IS NOT NULL THEN
        IF v_row.code_hash = p_code_hash THEN
            RETURN QUERY SELECT 'ok'::text, v_row.id;
        ELSE
            RETURN QUERY SELECT 'wrong'::text, NULL::uuid;
        END IF;
        RETURN;
    END IF;

    IF v_row.attempts >= c_max_attempts THEN
        RETURN QUERY SELECT 'locked'::text, NULL::uuid;
        RETURN;
    END IF;

    IF v_row.code_hash <> p_code_hash THEN
        UPDATE public.signup_phone_codes SET attempts = attempts + 1 WHERE id = v_row.id;
        RETURN QUERY SELECT (CASE WHEN v_row.attempts + 1 >= c_max_attempts THEN 'locked' ELSE 'wrong' END)::text, NULL::uuid;
        RETURN;
    END IF;

    UPDATE public.signup_phone_codes SET verified_at = now() WHERE id = v_row.id;
    RETURN QUERY SELECT 'ok'::text, v_row.id;
END;
$$;

REVOKE ALL ON FUNCTION public.signup_phone_code_check(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.signup_phone_code_check(text, text) TO service_role;
