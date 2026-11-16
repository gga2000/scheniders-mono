-- Behaviour test for paying us by transfer (Fermi B3), run against the newest
-- definitions in packages/supabase/migrations (see run.sh). Every check raises
-- on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   staff credit what really arrived (which may differ from what the shop
--   typed), between 1,000 and 10,000,000 IQD, once per request; more than
--   the shop typed only with the super-admin flag;
--   a refusal needs a reason of 3 to 300 characters, which the shop is told;
--   every approval gets the next receipt number; older approvals were numbered
--   in the order they were approved;
--   a credit that covers the month unlocks a locked shop (Q4: on approval);
--   the staff queue shows each shop's plan, price, wallet and lock, and warns
--   when the same receipt file or the same amount came in before;
--   a shop sends only its own request and the file's fingerprint; it can never
--   write what staff decide, decide, or read the queue.

\set ON_ERROR_STOP 1

CREATE TRIGGER trg_wallet_tx_settle_billing_lock
    AFTER INSERT ON public.wallet_transactions
    FOR EACH ROW WHEN (NEW.amount_iqd > 0)
    EXECUTE FUNCTION public.settle_billing_lock_after_credit();

INSERT INTO public.plan_limits (plan, base_price_iqd, order_price_iqd, trial_order_cap, lock_order_allowance) VALUES
  ('starter', 9000, 55, 0, 50),
  ('growth', 25000, 55, 0, 50);

-- L: trial ended, locked, empty wallet.  P: paid shop.  Old Shop is in the fixture.
INSERT INTO public.tenants (id, plan, status, trial_ends_at, display_id, business_name) VALUES
  ('30000000-0000-4000-8000-00000000000a', 'starter', 'trial', now() - interval '1 hour', 100901, 'Locked Shop'),
  ('30000000-0000-4000-8000-00000000000b', 'starter', 'active', now() - interval '40 days', 100902, 'Paid Shop');
INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end) VALUES
  ('30000000-0000-4000-8000-00000000000b', 'starter', 'active', now() - interval '10 days', now() + interval '20 days');
INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES
  ('30000000-0000-4000-8000-00000000000a', 0),
  ('30000000-0000-4000-8000-00000000000b', 3000),
  ('30000000-0000-4000-8000-0000000000a0', 0);
INSERT INTO auth.users (id) VALUES
  ('31000000-0000-4000-8000-00000000000a'),
  ('31000000-0000-4000-8000-00000000000b'),
  ('32000000-0000-4000-8000-000000000001');  -- staff

-- ---------------------------------------------------------------------------
-- 0. The migration numbered the old approval and kept the old refusal as it was.
DO $t$
DECLARE r record;
BEGIN
    SELECT credited_iqd, receipt_no INTO r FROM public.wallet_topup_requests
     WHERE receipt_path LIKE '%000000000001.jpg';
    IF r.credited_iqd IS DISTINCT FROM 25000 OR r.receipt_no IS DISTINCT FROM 1 THEN
        RAISE EXCEPTION 'FAIL old approval: credited %, receipt %', r.credited_iqd, r.receipt_no;
    END IF;
    SELECT credited_iqd, receipt_no, reject_reason INTO r FROM public.wallet_topup_requests
     WHERE receipt_path LIKE '%000000000002.jpg';
    IF r.credited_iqd IS NOT NULL OR r.receipt_no IS NOT NULL OR r.reject_reason IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL old refusal changed';
    END IF;
END;
$t$;

-- ---------------------------------------------------------------------------
-- 1. Shops send requests with the file's fingerprint, as themselves.
SELECT set_config('test.role', 'authenticated', false),
       set_config('test.uid', '31000000-0000-4000-8000-00000000000a', false),
       set_config('test.admin_of', '30000000-0000-4000-8000-00000000000a', false);
SET ROLE authenticated;
INSERT INTO public.wallet_topup_requests (tenant_id, amount_iqd, method, receipt_path, receipt_sha256) VALUES
  ('30000000-0000-4000-8000-00000000000a', 10000, 'qi_card',
   '30000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-000000000001.jpg', repeat('a', 64)),
  ('30000000-0000-4000-8000-00000000000a', 10000, 'qi_card',
   '30000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-000000000002.jpg', repeat('b', 64));

-- A shop cannot write what staff decide.
DO $t$
BEGIN
    BEGIN
        INSERT INTO public.wallet_topup_requests (tenant_id, amount_iqd, method, receipt_path, credited_iqd) VALUES
          ('30000000-0000-4000-8000-00000000000a', 10000, 'qi_card',
           '30000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-000000000003.jpg', 10000);
        RAISE EXCEPTION 'FAIL shop wrote credited_iqd';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        INSERT INTO public.wallet_topup_requests (tenant_id, amount_iqd, method, receipt_path, receipt_no) VALUES
          ('30000000-0000-4000-8000-00000000000a', 10000, 'qi_card',
           '30000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-000000000004.jpg', 99);
        RAISE EXCEPTION 'FAIL shop wrote receipt_no';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    -- A fingerprint must look like one.
    BEGIN
        INSERT INTO public.wallet_topup_requests (tenant_id, amount_iqd, method, receipt_path, receipt_sha256) VALUES
          ('30000000-0000-4000-8000-00000000000a', 10000, 'qi_card',
           '30000000-0000-4000-8000-00000000000a/50000000-0000-4000-8000-000000000005.jpg', 'not-a-hash');
        RAISE EXCEPTION 'FAIL bad fingerprint accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$t$;

-- A shop cannot decide or read the queue.
DO $t$
BEGIN
    BEGIN
        PERFORM public.decide_wallet_topup_request(
            (SELECT id FROM public.wallet_topup_requests WHERE receipt_sha256 = repeat('a', 64)),
            true, '31000000-0000-4000-8000-00000000000a', 50000, NULL);
        RAISE EXCEPTION 'FAIL shop decided';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    BEGIN
        PERFORM public.admin_topup_queue();
        RAISE EXCEPTION 'FAIL shop read the queue';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
END;
$t$;
RESET ROLE;

-- The other shop sends the SAME picture as Locked Shop's first receipt, for the
-- same amount (another shop's amount never counts as a repeat).
SELECT set_config('test.uid', '31000000-0000-4000-8000-00000000000b', false),
       set_config('test.admin_of', '30000000-0000-4000-8000-00000000000b', false);
SET ROLE authenticated;
INSERT INTO public.wallet_topup_requests (tenant_id, amount_iqd, method, receipt_path, receipt_sha256) VALUES
  ('30000000-0000-4000-8000-00000000000b', 10000, 'zain_cash',
   '30000000-0000-4000-8000-00000000000b/50000000-0000-4000-8000-000000000006.jpg', repeat('a', 64));
RESET ROLE;
SELECT set_config('test.role', '', false), set_config('test.uid', '', false), set_config('test.admin_of', '', false);

-- ---------------------------------------------------------------------------
-- 2. The staff queue.
DO $t$
DECLARE
    q jsonb := public.admin_topup_queue()->'requests';
    first jsonb;
    copy jsonb;
BEGIN
    IF jsonb_array_length(q) <> 3 THEN
        RAISE EXCEPTION 'FAIL queue has % rows, want the 3 open ones', jsonb_array_length(q);
    END IF;
    SELECT x INTO first FROM jsonb_array_elements(q) x WHERE x->>'receipt_path' LIKE '%000000000001.jpg';
    IF (first->>'display_id')::int <> 100901 OR first->>'business_name' <> 'Locked Shop'
       OR (first->'billing'->>'locked')::boolean IS NOT TRUE
       OR (first->'billing'->>'price_iqd')::numeric <> 9000
       OR (first->>'balance_iqd')::numeric <> 0 THEN
        RAISE EXCEPTION 'FAIL queue row for Locked Shop: %', first;
    END IF;
    IF jsonb_array_length(first->'same_file') <> 1 OR (first->'same_file'->0->>'display_id')::int <> 100902 THEN
        RAISE EXCEPTION 'FAIL same picture not flagged: %', first->'same_file';
    END IF;
    IF (first->>'same_amount_recent')::int <> 1 THEN
        RAISE EXCEPTION 'FAIL same amount from the same shop not counted: %', first->>'same_amount_recent';
    END IF;
    SELECT x INTO copy FROM jsonb_array_elements(q) x WHERE x->>'receipt_path' LIKE '%000000000006.jpg';
    IF (copy->'billing'->>'locked')::boolean IS NOT FALSE OR (copy->>'same_amount_recent')::int <> 0 THEN
        RAISE EXCEPTION 'FAIL queue row for Paid Shop: %', copy;
    END IF;
    -- Oldest first.
    IF q->0->>'receipt_path' NOT LIKE '%000000000001.jpg' THEN
        RAISE EXCEPTION 'FAIL queue order';
    END IF;
END;
$t$;

-- ---------------------------------------------------------------------------
-- 3. Approve what really arrived: the shop typed 10,000, 9,000 came in.
DO $t$
DECLARE
    req uuid := (SELECT id FROM public.wallet_topup_requests WHERE receipt_sha256 = repeat('a', 64)
                  AND tenant_id = '30000000-0000-4000-8000-00000000000a');
    staff uuid := '32000000-0000-4000-8000-000000000001';
    res jsonb;
    r public.wallet_topup_requests%ROWTYPE;
    n public.notifications%ROWTYPE;
BEGIN
    -- Out of range: nothing moves.
    res := public.decide_wallet_topup_request(req, true, staff, 999, NULL);
    IF res->>'error' IS DISTINCT FROM 'bad_amount' THEN RAISE EXCEPTION 'FAIL 999 accepted: %', res; END IF;
    res := public.decide_wallet_topup_request(req, true, staff, 10000001, NULL);
    IF res->>'error' IS DISTINCT FROM 'bad_amount' THEN RAISE EXCEPTION 'FAIL 10,000,001 accepted: %', res; END IF;
    res := public.decide_wallet_topup_request(req, true, NULL, 9000, NULL);
    IF res->>'error' IS DISTINCT FROM 'admin_required' THEN RAISE EXCEPTION 'FAIL no staff accepted: %', res; END IF;
    -- More than the shop said it sent (10,000) is a plain top-up: only with
    -- the flag the console sets for super admins.
    res := public.decide_wallet_topup_request(req, true, staff, 10001, NULL);
    IF res->>'error' IS DISTINCT FROM 'over_asked' THEN RAISE EXCEPTION 'FAIL over the shop''s figure accepted: %', res; END IF;
    res := public.decide_wallet_topup_request(req, true, staff, 10000000, NULL, false);
    IF res->>'error' IS DISTINCT FROM 'over_asked' THEN RAISE EXCEPTION 'FAIL 10,000,000 accepted from support: %', res; END IF;
    IF (SELECT balance_iqd FROM public.wallet WHERE tenant_id = '30000000-0000-4000-8000-00000000000a') <> 0
       OR (SELECT decided_at FROM public.wallet_topup_requests WHERE id = req) IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL a refused approval changed something';
    END IF;

    res := public.decide_wallet_topup_request(req, true, staff, 9000, 'ignored on approval');
    IF (res->>'success')::boolean IS NOT TRUE OR (res->>'credited')::int <> 9000 OR (res->>'receipt_no')::int <> 2 THEN
        RAISE EXCEPTION 'FAIL approve: %', res;
    END IF;
    SELECT * INTO r FROM public.wallet_topup_requests WHERE id = req;
    IF r.outcome <> 'approved' OR r.credited_iqd <> 9000 OR r.amount_iqd <> 10000 OR r.receipt_no <> 2
       OR r.reject_reason IS NOT NULL OR r.decided_by <> staff THEN
        RAISE EXCEPTION 'FAIL approved row: %', to_jsonb(r);
    END IF;
    SELECT * INTO n FROM public.notifications WHERE group_key = 'wallet.topup:' || req::text;
    IF n.type <> 'wallet.topup_approved' OR (n.payload->>'amount')::int <> 9000
       OR (n.payload->>'asked')::int <> 10000 OR (n.payload->>'receipt_no')::int <> 2 THEN
        RAISE EXCEPTION 'FAIL approval notice: %', to_jsonb(n);
    END IF;

    -- The 9,000 paid the month: the shop is unlocked at once, wallet back to 0.
    IF (public.billing_lock_snapshot('30000000-0000-4000-8000-00000000000a')->>'locked')::boolean IS NOT FALSE THEN
        RAISE EXCEPTION 'FAIL shop still locked after a credit that covers the month';
    END IF;
    IF (SELECT status::text FROM public.tenants WHERE id = '30000000-0000-4000-8000-00000000000a') <> 'active' THEN
        RAISE EXCEPTION 'FAIL shop not active after paying';
    END IF;
    IF (SELECT count(*) FROM public.wallet_transactions
         WHERE tenant_id = '30000000-0000-4000-8000-00000000000a' AND type = 'topup' AND amount_iqd = 9000
           AND reference_id = 'topup_request:' || req::text) <> 1 THEN
        RAISE EXCEPTION 'FAIL the credit is not in the ledger once';
    END IF;

    -- A second click credits nothing more.
    res := public.decide_wallet_topup_request(req, true, staff, 9000, NULL);
    IF res->>'error' IS DISTINCT FROM 'already_decided' THEN RAISE EXCEPTION 'FAIL second approve: %', res; END IF;
    IF (SELECT count(*) FROM public.wallet_transactions WHERE reference_id = 'topup_request:' || req::text) <> 1 THEN
        RAISE EXCEPTION 'FAIL second approve credited again';
    END IF;
END;
$t$;

-- ---------------------------------------------------------------------------
-- 4. Approve as asked when staff give no amount; the next number follows.
DO $t$
DECLARE
    req uuid := (SELECT id FROM public.wallet_topup_requests WHERE receipt_path LIKE '%000000000006.jpg');
    res jsonb;
BEGIN
    res := public.decide_wallet_topup_request(req, true, '32000000-0000-4000-8000-000000000001');
    IF (res->>'credited')::int <> 10000 OR (res->>'receipt_no')::int <> 3 THEN
        RAISE EXCEPTION 'FAIL approve as asked: %', res;
    END IF;
    IF (SELECT balance_iqd FROM public.wallet WHERE tenant_id = '30000000-0000-4000-8000-00000000000b') <> 13000 THEN
        RAISE EXCEPTION 'FAIL Paid Shop wallet';
    END IF;
END;
$t$;

-- ---------------------------------------------------------------------------
-- 5. A refusal needs a reason; the shop is told it.
DO $t$
DECLARE
    req uuid := (SELECT id FROM public.wallet_topup_requests WHERE receipt_sha256 = repeat('b', 64));
    staff uuid := '32000000-0000-4000-8000-000000000001';
    res jsonb;
    r public.wallet_topup_requests%ROWTYPE;
    n public.notifications%ROWTYPE;
BEGIN
    res := public.decide_wallet_topup_request(req, false, staff);
    IF res->>'error' IS DISTINCT FROM 'reason_required' THEN RAISE EXCEPTION 'FAIL refusal without reason: %', res; END IF;
    res := public.decide_wallet_topup_request(req, false, staff, NULL, '  no ');
    IF res->>'error' IS DISTINCT FROM 'reason_required' THEN RAISE EXCEPTION 'FAIL 2-letter reason: %', res; END IF;
    res := public.decide_wallet_topup_request(req, false, staff, NULL, repeat('x', 301));
    IF res->>'error' IS DISTINCT FROM 'reason_required' THEN RAISE EXCEPTION 'FAIL 301-letter reason: %', res; END IF;
    IF (SELECT decided_at FROM public.wallet_topup_requests WHERE id = req) IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL a refused refusal decided the request';
    END IF;

    res := public.decide_wallet_topup_request(req, false, staff, 50000, '  The amount on the receipt is 5,000 ');
    IF (res->>'success')::boolean IS NOT TRUE OR res->>'outcome' <> 'rejected' OR res->'receipt_no' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'FAIL refuse: %', res;
    END IF;
    SELECT * INTO r FROM public.wallet_topup_requests WHERE id = req;
    IF r.reject_reason <> 'The amount on the receipt is 5,000' OR r.credited_iqd IS NOT NULL OR r.receipt_no IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL refused row: %', to_jsonb(r);
    END IF;
    SELECT * INTO n FROM public.notifications WHERE group_key = 'wallet.topup:' || req::text;
    IF n.type <> 'wallet.topup_rejected' OR n.payload->>'reason' <> 'The amount on the receipt is 5,000'
       OR (n.payload->>'amount')::int <> 10000 THEN
        RAISE EXCEPTION 'FAIL refusal notice: %', to_jsonb(n);
    END IF;
    -- Refusing moved no money.
    IF EXISTS (SELECT 1 FROM public.wallet_transactions WHERE reference_id = 'topup_request:' || req::text) THEN
        RAISE EXCEPTION 'FAIL a refusal credited the wallet';
    END IF;
END;
$t$;

-- The queue is empty now; an unknown request is not found.
DO $t$
BEGIN
    IF jsonb_array_length(public.admin_topup_queue()->'requests') <> 0 THEN
        RAISE EXCEPTION 'FAIL decided requests still queued';
    END IF;
    IF public.decide_wallet_topup_request(gen_random_uuid(), true, '32000000-0000-4000-8000-000000000001')->>'error'
       IS DISTINCT FROM 'not_found' THEN
        RAISE EXCEPTION 'FAIL unknown request';
    END IF;
END;
$t$;

-- ---------------------------------------------------------------------------
-- 6. The table refuses half a decision, even from the service role.
DO $t$
BEGIN
    BEGIN
        INSERT INTO public.wallet_topup_requests (tenant_id, requested_by, amount_iqd, method, receipt_path, credited_iqd)
        VALUES ('30000000-0000-4000-8000-00000000000b', '31000000-0000-4000-8000-00000000000b', 5000, 'qi_card',
                '30000000-0000-4000-8000-00000000000b/50000000-0000-4000-8000-000000000007.jpg', 5000);
        RAISE EXCEPTION 'FAIL credited amount on an open request';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.wallet_topup_requests SET receipt_no = NULL WHERE outcome = 'approved';
        RAISE EXCEPTION 'FAIL approval without a receipt number';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.wallet_topup_requests SET reject_reason = 'why' WHERE outcome = 'approved';
        RAISE EXCEPTION 'FAIL reason on an approval';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.wallet_topup_requests SET receipt_no = 2 WHERE receipt_no = 3;
        RAISE EXCEPTION 'FAIL two receipts with one number';
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
END;
$t$;

-- ---------------------------------------------------------------------------
-- 7. Where shops pay: every signed-in shop reads the six fields, nothing else.
INSERT INTO public.admin_settings (key, value) VALUES ('topup_payment', jsonb_build_object(
    'qi_card', ' 7000 1234 5678 ', 'qi_card_name', 'Fermi Co', 'zain_cash', '',
    'support_whatsapp', '9647700000000', 'working_hours', 'Sat-Thu 10:00-18:00',
    'legal_name', 'Fermi LLC', 'internal_note', 'never shown'));
SELECT set_config('test.role', 'authenticated', false), set_config('test.uid', '31000000-0000-4000-8000-00000000000a', false);
SET ROLE authenticated;
DO $t$
DECLARE d jsonb := public.get_topup_payment_details();
BEGIN
    IF d <> jsonb_build_object('qi_card', '7000 1234 5678', 'qi_card_name', 'Fermi Co', 'zain_cash', NULL,
                                'support_whatsapp', '9647700000000', 'working_hours', 'Sat-Thu 10:00-18:00',
                                'legal_name', 'Fermi LLC') THEN
        RAISE EXCEPTION 'FAIL payment details: %', d;
    END IF;
END;
$t$;
RESET ROLE;
SET ROLE anon;
DO $t$
BEGIN
    PERFORM public.get_topup_payment_details();
    RAISE EXCEPTION 'FAIL anon read the payment details';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END;
$t$;
RESET ROLE;

-- 8. Grants: the staff functions are the service role's only.
DO $t$
BEGIN
    IF has_function_privilege('authenticated', 'public.decide_wallet_topup_request(uuid, boolean, uuid, integer, text, boolean)', 'EXECUTE')
       OR has_function_privilege('anon', 'public.decide_wallet_topup_request(uuid, boolean, uuid, integer, text, boolean)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.admin_topup_queue()', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.admin_topup_queue()', 'EXECUTE') THEN
        RAISE EXCEPTION 'FAIL staff function grants';
    END IF;
    IF to_regprocedure('public.decide_wallet_topup_request(uuid, boolean, uuid)') IS NOT NULL THEN
        RAISE EXCEPTION 'FAIL the old three-argument decide is still there';
    END IF;
END;
$t$;

SELECT 'topup: all checks passed' AS result;
