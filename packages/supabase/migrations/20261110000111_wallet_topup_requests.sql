-- Wallet top-up by receipt (Ali, 9 Nov): the shop sends money by Zain Cash or
-- Qi to the number shown, uploads the receipt, and our team confirms it in
-- the admin app. Confirming credits the wallet in the same transaction.

CREATE TABLE IF NOT EXISTS public.wallet_topup_requests (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    requested_by uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    amount_iqd integer NOT NULL CHECK (amount_iqd BETWEEN 1000 AND 10000000),
    method text NOT NULL CHECK (method IN ('zain_cash', 'qi_card')),
    receipt_path text NOT NULL CHECK (receipt_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|pdf)$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    outcome text CHECK (outcome IN ('approved', 'rejected')),
    CHECK ((decided_at IS NULL) = (outcome IS NULL)),
    -- The receipt must sit in the shop's own folder.
    CHECK (split_part(receipt_path, '/', 1) = tenant_id::text)
);
CREATE INDEX IF NOT EXISTS wallet_topup_requests_open ON public.wallet_topup_requests (created_at) WHERE decided_at IS NULL;
CREATE INDEX IF NOT EXISTS wallet_topup_requests_tenant ON public.wallet_topup_requests (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_topup_requests_requested_by ON public.wallet_topup_requests (requested_by);
CREATE INDEX IF NOT EXISTS wallet_topup_requests_decided_by ON public.wallet_topup_requests (decided_by) WHERE decided_by IS NOT NULL;

ALTER TABLE public.wallet_topup_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wallet_topup_requests_select ON public.wallet_topup_requests;
CREATE POLICY wallet_topup_requests_select ON public.wallet_topup_requests
    FOR SELECT TO authenticated USING ((SELECT public.is_tenant_admin(tenant_id)));
DROP POLICY IF EXISTS wallet_topup_requests_insert ON public.wallet_topup_requests;
CREATE POLICY wallet_topup_requests_insert ON public.wallet_topup_requests
    FOR INSERT TO authenticated
    WITH CHECK ((SELECT public.is_tenant_admin(tenant_id)) AND requested_by = (SELECT auth.uid())
                AND decided_at IS NULL AND decided_by IS NULL AND outcome IS NULL);
REVOKE ALL ON public.wallet_topup_requests FROM anon;
REVOKE ALL ON public.wallet_topup_requests FROM authenticated;
GRANT SELECT ON public.wallet_topup_requests TO authenticated;
GRANT INSERT (tenant_id, amount_iqd, method, receipt_path) ON public.wallet_topup_requests TO authenticated;
GRANT ALL ON public.wallet_topup_requests TO service_role;

-- Receipts: private bucket, one folder per shop, 5 MB, photos or PDF.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('wallet-receipts', 'wallet-receipts', false, 5242880,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
    SET public = false, file_size_limit = EXCLUDED.file_size_limit, allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS wallet_receipts_insert ON storage.objects;
CREATE POLICY wallet_receipts_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'wallet-receipts'
                AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
                AND (SELECT public.is_tenant_admin(((storage.foldername(name))[1])::uuid)));
DROP POLICY IF EXISTS wallet_receipts_select ON storage.objects;
CREATE POLICY wallet_receipts_select ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'wallet-receipts'
           AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
           AND (SELECT public.is_tenant_admin(((storage.foldername(name))[1])::uuid)));

-- Where shops send the money. Set by our team in admin_settings
-- (key 'topup_payment', value {"zain_cash": "...", "qi_card": "..."}); shops read
-- only these two fields.
CREATE OR REPLACE FUNCTION public.get_topup_payment_details()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT jsonb_build_object(
        'zain_cash', nullif(btrim(s.value->>'zain_cash'), ''),
        'qi_card', nullif(btrim(s.value->>'qi_card'), ''))
      FROM (SELECT (SELECT value FROM public.admin_settings WHERE key = 'topup_payment') AS value) s
     WHERE auth.uid() IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.get_topup_payment_details() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_topup_payment_details() TO authenticated, service_role;

-- Confirm or refuse a request. Service role only (the admin app). Approving
-- credits the wallet with the request as the idempotency key, so a double
-- click or a retry never credits twice; a decided request is left alone.
CREATE OR REPLACE FUNCTION public.decide_wallet_topup_request(_request_id uuid, _approve boolean, _admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _req public.wallet_topup_requests%ROWTYPE;
    _topup jsonb;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'decide_wallet_topup_request is service-role only' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO _req FROM public.wallet_topup_requests WHERE id = _request_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    IF _req.decided_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_decided', 'outcome', _req.outcome);
    END IF;

    IF _approve THEN
        _topup := public.admin_topup_wallet(
            _req.tenant_id, _req.amount_iqd,
            CASE _req.method WHEN 'zain_cash' THEN 'Top-up by Zain Cash' ELSE 'Top-up by Qi' END,
            _admin_id, _req.method, 'topup_request:' || _req.id::text);
        IF coalesce((_topup->>'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', coalesce(_topup->>'error', 'topup_failed'));
        END IF;
    END IF;

    UPDATE public.wallet_topup_requests
       SET decided_at = now(), decided_by = _admin_id,
           outcome = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END
     WHERE id = _req.id;

    INSERT INTO public.notifications (tenant_id, type, category, audience, recipient_id, payload, priority, group_key)
    VALUES (_req.tenant_id,
            CASE WHEN _approve THEN 'wallet.topup_approved' ELSE 'wallet.topup_rejected' END,
            'finance', 'tenant', NULL,
            jsonb_build_object('amount', _req.amount_iqd),
            'high', 'wallet.topup:' || _req.id::text);

    RETURN jsonb_build_object('success', true, 'outcome', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
                              'new_balance', _topup->'new_balance');
END;
$function$;
REVOKE ALL ON FUNCTION public.decide_wallet_topup_request(uuid, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_wallet_topup_request(uuid, boolean, uuid) TO service_role;