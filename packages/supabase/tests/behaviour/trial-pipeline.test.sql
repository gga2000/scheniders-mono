-- Behaviour test for admin_trial_pipeline (Fermi B12 item 1), run against the
-- newest definitions in packages/supabase/migrations (run.sh). Every check
-- raises on a wrong result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Rules under test:
--   every shop on trial is listed, a paused trial too; an active shop, the
--   demo store and a prospect store are not;
--   orders and delivered count real orders only (no test, practice,
--   deleted, abandoned-cart or demo orders; a return is not delivered);
--   shipped is any real order in transit or later;
--   WhatsApp sent counts outbound sent messages, and the cap is the plan's;
--   Prime linked, the one-trial check, the owner's phone and a billing lock
--   are read as they are; the last call is the newest one;
--   a shop with nothing has zeros, false and nulls, not a missing row;
--   only the service role may read it, and the browser roles have no EXECUTE.

INSERT INTO public.plan_limits (plan, trial_whatsapp_cap) VALUES ('starter', 200), ('growth', 150);

INSERT INTO public.tenants (id, business_name, plan, status, restrictions, is_demo, is_prospect, contact_phone, created_at) VALUES
    ('10000000-0000-4000-8000-000000000001', 'busy trial',   'starter', 'trial',   '{}', false, false, '07701234567', now() - interval '2 days'),
    ('10000000-0000-4000-8000-000000000002', 'paused trial', 'growth',  'limited', '{"status_before": "trial"}', false, false, '  ', now() - interval '5 days'),
    ('10000000-0000-4000-8000-000000000003', 'quiet trial',  'starter', 'trial',   '{}', false, false, NULL, now() - interval '1 day'),
    ('10000000-0000-4000-8000-000000000004', 'paying shop',  'starter', 'active',  '{}', false, false, NULL, now() - interval '40 days'),
    ('10000000-0000-4000-8000-000000000005', 'demo store',   'starter', 'trial',   '{}', true,  false, NULL, now() - interval '3 days'),
    ('10000000-0000-4000-8000-000000000006', 'prospect',     'starter', 'trial',   '{}', false, true,  NULL, now() - interval '3 days'),
    ('10000000-0000-4000-8000-000000000007', 'paused paying', 'starter', 'limited', '{"status_before": "active"}', false, false, NULL, now() - interval '50 days');

INSERT INTO public.orders (tenant_id, status, is_test, guide_practice, deleted_at, is_return, take_kind) VALUES
    ('10000000-0000-4000-8000-000000000001', 'completed',        false, false, NULL,  false, NULL),
    ('10000000-0000-4000-8000-000000000001', 'in_transit',       false, false, NULL,  false, NULL),
    ('10000000-0000-4000-8000-000000000001', 'new',              false, false, NULL,  false, NULL),
    ('10000000-0000-4000-8000-000000000001', 'delivered',        false, false, NULL,  true,  NULL),
    ('10000000-0000-4000-8000-000000000001', 'delivered',        true,  false, NULL,  false, NULL),
    ('10000000-0000-4000-8000-000000000001', 'delivered',        false, true,  NULL,  false, NULL),
    ('10000000-0000-4000-8000-000000000001', 'delivered',        false, false, now(), false, NULL),
    ('10000000-0000-4000-8000-000000000001', 'pending_checkout', false, false, NULL,  false, NULL),
    ('10000000-0000-4000-8000-000000000001', 'delivered',        false, false, NULL,  false, 'till'),
    -- The paused trial has only orders that never shipped.
    ('10000000-0000-4000-8000-000000000002', 'new',              false, false, NULL,  false, NULL),
    ('10000000-0000-4000-8000-000000000002', 'cancelled',        false, false, NULL,  false, NULL),
    ('10000000-0000-4000-8000-000000000005', 'delivered',        false, false, NULL,  false, NULL);

INSERT INTO public.whatsapp_logs (tenant_id, direction, status) VALUES
    ('10000000-0000-4000-8000-000000000001', 'outbound', 'sent'),
    ('10000000-0000-4000-8000-000000000001', 'outbound', 'sent'),
    ('10000000-0000-4000-8000-000000000001', 'outbound', 'sent'),
    ('10000000-0000-4000-8000-000000000001', 'outbound', 'failed'),
    ('10000000-0000-4000-8000-000000000001', 'inbound',  'sent');

INSERT INTO public.prime_connections (tenant_id, is_active) VALUES
    ('10000000-0000-4000-8000-000000000001', true),
    ('10000000-0000-4000-8000-000000000002', false);

INSERT INTO public.trial_checks (tenant_id, verdict, staff_decision) VALUES
    ('10000000-0000-4000-8000-000000000002', 'review', 'allow_trial');

INSERT INTO public.billing_locks (tenant_id, reason) VALUES
    ('10000000-0000-4000-8000-000000000002', 'trial_ended');

INSERT INTO public.support_calls (tenant_id, admin_id, admin_name, outcome, created_at) VALUES
    ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'Noor',   'no_answer', now() - interval '1 day'),
    ('10000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Karrar', 'done',      now() - interval '2 hours'),
    ('10000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000001', 'Noor',   'done',      now() - interval '3 hours');

DO $t$
DECLARE
    answer jsonb := public.admin_trial_pipeline();
    busy jsonb;
    paused jsonb;
    quiet jsonb;
BEGIN
    IF jsonb_typeof(answer) <> 'array' THEN RAISE EXCEPTION 'not an array: %', answer; END IF;
    -- Listed: the three trials, oldest shop first. Not listed: paying, demo,
    -- prospect, a paused paying shop.
    IF (SELECT array_agg(e->>'tenant_id' ORDER BY ord) FROM jsonb_array_elements(answer) WITH ORDINALITY AS x(e, ord))
       <> ARRAY['10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
                '10000000-0000-4000-8000-000000000003'] THEN
        RAISE EXCEPTION 'wrong shops listed: %', answer;
    END IF;
    SELECT e INTO busy FROM jsonb_array_elements(answer) e WHERE e->>'tenant_id' = '10000000-0000-4000-8000-000000000001';
    SELECT e INTO paused FROM jsonb_array_elements(answer) e WHERE e->>'tenant_id' = '10000000-0000-4000-8000-000000000002';
    SELECT e INTO quiet FROM jsonb_array_elements(answer) e WHERE e->>'tenant_id' = '10000000-0000-4000-8000-000000000003';

    -- Real orders: completed, in_transit, new and the return (4); delivered
    -- leaves out the return (1); test, practice, deleted, abandoned cart and
    -- till sale are not orders here.
    IF (busy->>'orders')::int <> 4 OR (busy->>'delivered')::int <> 1 OR NOT (busy->>'shipped')::boolean THEN
        RAISE EXCEPTION 'busy trial orders: %', busy;
    END IF;
    IF (busy->>'whatsapp_sent')::int <> 3 OR (busy->>'whatsapp_cap')::int <> 200 THEN
        RAISE EXCEPTION 'busy trial WhatsApp: %', busy;
    END IF;
    IF NOT (busy->>'prime_linked')::boolean OR busy->>'owner_phone' <> '07701234567'
       OR busy->'trial_check' <> 'null'::jsonb OR busy->'lock_reason' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'busy trial facts: %', busy;
    END IF;
    IF busy->'last_call'->>'by' <> 'Karrar' OR busy->'last_call'->>'outcome' <> 'done'
       OR (busy->'last_call'->>'at')::timestamptz NOT BETWEEN now() - interval '2 hours 1 minute'
                                                          AND now() - interval '1 hour 59 minutes' THEN
        RAISE EXCEPTION 'busy trial last call is not the newest: %', busy->'last_call';
    END IF;
    -- The seed rows were written a moment before this block, so allow a minute.
    IF (busy->>'created_at')::timestamptz NOT BETWEEN now() - interval '2 days 1 minute'
                                                  AND now() - interval '1 day 23 hours 59 minutes' THEN
        RAISE EXCEPTION 'busy trial signup time: %', busy->>'created_at';
    END IF;

    -- Paused trial: still listed, its plan's cap, the lock and the check as
    -- they are; a blank phone is no phone; orders that never shipped.
    IF (paused->>'orders')::int <> 2 OR (paused->>'delivered')::int <> 0 OR (paused->>'shipped')::boolean
       OR (paused->>'whatsapp_cap')::int <> 150 OR (paused->>'prime_linked')::boolean
       OR paused->>'trial_check' <> 'review' OR paused->>'trial_check_decision' <> 'allow_trial'
       OR paused->>'lock_reason' <> 'trial_ended' OR paused->'owner_phone' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'paused trial facts: %', paused;
    END IF;

    -- A shop with nothing yet: zeros and nulls, still a row.
    IF (quiet->>'orders')::int <> 0 OR (quiet->>'delivered')::int <> 0 OR (quiet->>'shipped')::boolean
       OR (quiet->>'whatsapp_sent')::int <> 0 OR (quiet->>'prime_linked')::boolean
       OR quiet->'last_call' <> 'null'::jsonb OR quiet->'owner_phone' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'quiet trial facts: %', quiet;
    END IF;

    -- Only the service role may read it.
    PERFORM set_config('test.role', 'authenticated', true);
    BEGIN
        PERFORM public.admin_trial_pipeline();
        RAISE EXCEPTION 'a signed-in browser read the trial pipeline';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;
    PERFORM set_config('test.role', '', true);
END;
$t$;

-- No trial shop at all: an empty array, not null.
DO $e$
BEGIN
    UPDATE public.tenants SET status = 'active', restrictions = '{}' WHERE status IN ('trial', 'limited');
    IF public.admin_trial_pipeline() <> '[]'::jsonb THEN
        RAISE EXCEPTION 'no trials: %', public.admin_trial_pipeline();
    END IF;
END;
$e$;

DO $g$
BEGIN
    IF has_function_privilege('authenticated', 'public.admin_trial_pipeline()', 'EXECUTE')
       OR has_function_privilege('anon', 'public.admin_trial_pipeline()', 'EXECUTE') THEN
        RAISE EXCEPTION 'browser roles can call admin_trial_pipeline';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.admin_trial_pipeline()', 'EXECUTE') THEN
        RAISE EXCEPTION 'the service role cannot call admin_trial_pipeline';
    END IF;
END;
$g$;
