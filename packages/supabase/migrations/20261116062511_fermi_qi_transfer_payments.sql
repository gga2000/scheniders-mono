-- Fermi B3 (Ali, 16 Nov): shops pay us by Qi transfer. The shop sends the
-- money, uploads a photo of the receipt, our team checks it and the money
-- lands in the shop's wallet. The wallet pays the plan, per-order fees and
-- WhatsApp, and a credit that covers the plan unlocks a locked shop at once
-- (handoff A1, admin_topup_wallet). Q4 default: unlock after the team approves.
--
-- Built on the receipt top-up of 10 Nov (20261110000111_wallet_topup_requests):
--   1. Staff may credit a different amount than the shop typed (what really
--      arrived), and must give a reason when they refuse; the shop sees it and
--      can send again.
--   2. Each approved payment gets a receipt number, for the printed receipt.
--   3. The shop's browser sends the receipt file's SHA-256, so staff are
--      warned when the same picture comes in twice.
--   4. Where shops pay (Qi number and account name, Zain Cash), the support
--      WhatsApp, working hours and our legal name are one setting staff edit
--      in the console; shops read them here.
--   5. admin_topup_queue(): the staff queue in one answer, with each shop's
--      plan, what it owes, its wallet and any repeat receipt.

-- 1-3. What staff decided, and the receipt's fingerprint.
ALTER TABLE public.wallet_topup_requests
    ADD COLUMN IF NOT EXISTS credited_iqd integer,
    ADD COLUMN IF NOT EXISTS reject_reason text,
    ADD COLUMN IF NOT EXISTS receipt_sha256 text,
    ADD COLUMN IF NOT EXISTS receipt_no integer;

COMMENT ON COLUMN public.wallet_topup_requests.credited_iqd IS
    'What staff added to the wallet on approval (what really arrived); may differ from amount_iqd, which the shop typed.';
COMMENT ON COLUMN public.wallet_topup_requests.reject_reason IS
    'Why staff refused the receipt, shown to the shop.';
COMMENT ON COLUMN public.wallet_topup_requests.receipt_sha256 IS
    'SHA-256 of the receipt file, from the shop''s browser. Only used to warn staff about a repeat; never trusted for money.';
COMMENT ON COLUMN public.wallet_topup_requests.receipt_no IS
    'Number of the printed payment receipt, given on approval.';

-- Requests approved before today: what was credited is what was asked.
UPDATE public.wallet_topup_requests
   SET credited_iqd = amount_iqd
 WHERE outcome = 'approved' AND credited_iqd IS NULL;

CREATE SEQUENCE IF NOT EXISTS public.payment_receipt_no_seq AS integer START WITH 1 MINVALUE 1;
ALTER SEQUENCE public.payment_receipt_no_seq OWNED BY public.wallet_topup_requests.receipt_no;
-- Older approved payments get numbers too, in the order they were approved.
WITH numbered AS (
    SELECT id, row_number() OVER (ORDER BY decided_at, id) AS n
      FROM public.wallet_topup_requests
     WHERE outcome = 'approved' AND receipt_no IS NULL
)
UPDATE public.wallet_topup_requests r
   SET receipt_no = numbered.n
  FROM numbered
 WHERE r.id = numbered.id;
SELECT setval('public.payment_receipt_no_seq',
              coalesce((SELECT max(receipt_no) FROM public.wallet_topup_requests), 0) + 1, false);

DO $c$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_topup_requests_credited_iqd_check') THEN
        ALTER TABLE public.wallet_topup_requests ADD CONSTRAINT wallet_topup_requests_credited_iqd_check
            CHECK (credited_iqd BETWEEN 1000 AND 10000000);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_topup_requests_reject_reason_check') THEN
        ALTER TABLE public.wallet_topup_requests ADD CONSTRAINT wallet_topup_requests_reject_reason_check
            CHECK (char_length(btrim(reject_reason)) BETWEEN 3 AND 300);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_topup_requests_receipt_sha256_check') THEN
        ALTER TABLE public.wallet_topup_requests ADD CONSTRAINT wallet_topup_requests_receipt_sha256_check
            CHECK (receipt_sha256 ~ '^[0-9a-f]{64}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_topup_requests_receipt_no_key') THEN
        ALTER TABLE public.wallet_topup_requests ADD CONSTRAINT wallet_topup_requests_receipt_no_key UNIQUE (receipt_no);
    END IF;
    -- A credited amount and a receipt number only on an approval, a reason only
    -- on a refusal; every approval carries both. Older refusals have no reason.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_topup_requests_decision_detail_check') THEN
        ALTER TABLE public.wallet_topup_requests ADD CONSTRAINT wallet_topup_requests_decision_detail_check
            CHECK (    ((outcome IS NOT DISTINCT FROM 'approved') = (credited_iqd IS NOT NULL))
                   AND ((outcome IS NOT DISTINCT FROM 'approved') = (receipt_no IS NOT NULL))
                   AND (reject_reason IS NULL OR outcome IS NOT DISTINCT FROM 'rejected'));
    END IF;
END;
$c$;

CREATE INDEX IF NOT EXISTS wallet_topup_requests_receipt_sha256
    ON public.wallet_topup_requests (receipt_sha256) WHERE receipt_sha256 IS NOT NULL;

-- The shop sends the fingerprint with its request; nothing else new.
GRANT INSERT (tenant_id, amount_iqd, method, receipt_path, receipt_sha256) ON public.wallet_topup_requests TO authenticated;

-- 4. Where shops pay us, as staff set it (admin_settings 'topup_payment').
--    Shown to every signed-in shop, so nothing secret belongs here.
CREATE OR REPLACE FUNCTION public.get_topup_payment_details()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
    SELECT jsonb_build_object(
        'zain_cash', nullif(btrim(s.value->>'zain_cash'), ''),
        'qi_card', nullif(btrim(s.value->>'qi_card'), ''),
        'qi_card_name', nullif(btrim(s.value->>'qi_card_name'), ''),
        'support_whatsapp', nullif(btrim(s.value->>'support_whatsapp'), ''),
        'working_hours', nullif(btrim(s.value->>'working_hours'), ''),
        'legal_name', nullif(btrim(s.value->>'legal_name'), ''))
      FROM (SELECT (SELECT value FROM public.admin_settings WHERE key = 'topup_payment') AS value) s
     WHERE auth.uid() IS NOT NULL;
$function$;
REVOKE ALL ON FUNCTION public.get_topup_payment_details() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_topup_payment_details() TO authenticated, service_role;

-- 1-2. Approve (crediting what arrived) or refuse (saying why). Service role
--      only (the staff console). The request is the payment's key, so a double
--      click or a retry never credits twice; a decided request is left alone.
DROP FUNCTION IF EXISTS public.decide_wallet_topup_request(uuid, boolean, uuid);
CREATE OR REPLACE FUNCTION public.decide_wallet_topup_request(
    _request_id uuid,
    _approve boolean,
    _admin_id uuid,
    _amount integer DEFAULT NULL,
    _reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _req public.wallet_topup_requests%ROWTYPE;
    _credit integer;
    _why text := nullif(btrim(_reason), '');
    _topup jsonb;
    _no integer;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'decide_wallet_topup_request is service-role only' USING ERRCODE = '42501';
    END IF;
    IF _admin_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'admin_required');
    END IF;

    SELECT * INTO _req FROM public.wallet_topup_requests WHERE id = _request_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'not_found');
    END IF;
    IF _req.decided_at IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'already_decided', 'outcome', _req.outcome);
    END IF;

    IF _approve THEN
        _credit := coalesce(_amount, _req.amount_iqd);
        IF _credit NOT BETWEEN 1000 AND 10000000 THEN
            RETURN jsonb_build_object('success', false, 'error', 'bad_amount');
        END IF;
        _topup := public.admin_topup_wallet(
            _req.tenant_id, _credit,
            CASE _req.method WHEN 'zain_cash' THEN 'Top-up by Zain Cash' ELSE 'Top-up by Qi' END,
            _admin_id, _req.method, 'topup_request:' || _req.id::text);
        IF coalesce((_topup->>'success')::boolean, false) IS NOT TRUE THEN
            RETURN jsonb_build_object('success', false, 'error', coalesce(_topup->>'error', 'topup_failed'));
        END IF;
        _no := nextval('public.payment_receipt_no_seq');
    ELSIF _why IS NULL OR char_length(_why) NOT BETWEEN 3 AND 300 THEN
        RETURN jsonb_build_object('success', false, 'error', 'reason_required');
    END IF;

    UPDATE public.wallet_topup_requests
       SET decided_at = now(), decided_by = _admin_id,
           outcome = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
           credited_iqd = CASE WHEN _approve THEN _credit END,
           receipt_no = _no,
           reject_reason = CASE WHEN _approve THEN NULL ELSE _why END
     WHERE id = _req.id;

    INSERT INTO public.notifications (tenant_id, type, category, audience, recipient_id, payload, priority, group_key)
    VALUES (_req.tenant_id,
            CASE WHEN _approve THEN 'wallet.topup_approved' ELSE 'wallet.topup_rejected' END,
            'finance', 'tenant', NULL,
            CASE WHEN _approve
                 THEN jsonb_build_object('amount', _credit, 'asked', _req.amount_iqd, 'receipt_no', _no)
                 ELSE jsonb_build_object('amount', _req.amount_iqd, 'reason', _why) END,
            'high', 'wallet.topup:' || _req.id::text);

    RETURN jsonb_build_object(
        'success', true,
        'outcome', CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
        'credited', _credit,
        'receipt_no', _no,
        'new_balance', _topup->'new_balance');
END;
$function$;
REVOKE ALL ON FUNCTION public.decide_wallet_topup_request(uuid, boolean, uuid, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_wallet_topup_request(uuid, boolean, uuid, integer, text) TO service_role;

-- 5. The staff queue: receipts waiting, oldest first, each with what staff
--    need to decide: the shop's plan and what its next payment takes, its
--    wallet, whether it is locked, and any earlier request with the same
--    receipt file or the same amount from the same shop in the last 7 days.
CREATE OR REPLACE FUNCTION public.admin_topup_queue()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    _rows jsonb;
BEGIN
    IF coalesce(auth.role(), 'service_role') <> 'service_role' THEN
        RAISE EXCEPTION 'admin_topup_queue is service-role only' USING ERRCODE = '42501';
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', r.id,
               'tenant_id', r.tenant_id,
               'display_id', t.display_id,
               'business_name', t.business_name,
               'tenant_status', t.status::text,
               'amount_iqd', r.amount_iqd,
               'method', r.method,
               'receipt_path', r.receipt_path,
               'created_at', r.created_at,
               'balance_iqd', coalesce(w.balance_iqd, 0),
               'billing', public.billing_lock_snapshot(r.tenant_id),
               'same_file', coalesce((
                    SELECT jsonb_agg(jsonb_build_object(
                               'id', o.id,
                               'display_id', ot.display_id,
                               'business_name', ot.business_name,
                               'outcome', o.outcome,
                               'created_at', o.created_at)
                             ORDER BY o.created_at)
                      FROM public.wallet_topup_requests o
                      JOIN public.tenants ot ON ot.id = o.tenant_id
                     WHERE o.receipt_sha256 = r.receipt_sha256
                       AND o.id <> r.id), '[]'::jsonb),
               'same_amount_recent', (
                    SELECT count(*)::integer
                      FROM public.wallet_topup_requests o
                     WHERE o.tenant_id = r.tenant_id
                       AND o.amount_iqd = r.amount_iqd
                       AND o.id <> r.id
                       AND o.created_at >= r.created_at - interval '7 days'
                       AND o.created_at <= r.created_at + interval '7 days'))
             ORDER BY r.created_at), '[]'::jsonb)
      INTO _rows
      FROM (SELECT * FROM public.wallet_topup_requests
             WHERE decided_at IS NULL
             ORDER BY created_at
             LIMIT 100) r
      JOIN public.tenants t ON t.id = r.tenant_id
      LEFT JOIN public.wallet w ON w.tenant_id = r.tenant_id;

    RETURN jsonb_build_object('requests', _rows);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_topup_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_topup_queue() TO service_role;
