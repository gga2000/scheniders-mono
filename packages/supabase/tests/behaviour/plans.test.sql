-- Plans and pricing (Fermi B1, 20261116042723). Every check raises on a wrong
-- result, so psql -v ON_ERROR_STOP=1 fails.
--
-- Shops: T trial on Team (growth); P paid Start (starter), half its month left;
-- Q paid Start with almost nothing in the wallet; B paid Business
-- (professional); R paid Team whose month is over, a downgrade waiting.

\set ON_ERROR_STOP 1

CREATE TRIGGER trg_orders_charge_delivered
    AFTER INSERT OR UPDATE OF status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.charge_delivered_order();

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FAIL %', p_label; END IF;
END $$;
-- SQLSTATE and hint a statement raises, as 'PT402/BRANCH_LIMIT', or NULL.
CREATE FUNCTION pg_temp.raised(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE _state text; _hint text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS _state = RETURNED_SQLSTATE, _hint = PG_EXCEPTION_HINT;
  RETURN _state || '/' || coalesce(_hint, '');
END $$;
-- Act as the admin of a shop.
CREATE FUNCTION pg_temp.as_admin(p_tenant text) RETURNS void LANGUAGE sql AS $$
  SELECT set_config('test.role', 'authenticated', false),
         set_config('test.uid', '90000000-0000-4000-8000-000000000001', false),
         set_config('test.admin_of', p_tenant, false),
         set_config('test.member_of', p_tenant, false);
$$;
CREATE FUNCTION pg_temp.balance(p_tenant text) RETURNS numeric LANGUAGE sql AS $$
  SELECT balance_iqd FROM public.wallet WHERE tenant_id = p_tenant::uuid;
$$;
CREATE FUNCTION pg_temp.plan_of(p_tenant text) RETURNS text LANGUAGE sql AS $$
  SELECT plan::text FROM public.tenants WHERE id = p_tenant::uuid;
$$;
CREATE FUNCTION pg_temp.pending_of(p_tenant text) RETURNS text LANGUAGE sql AS $$
  SELECT pending_plan::text FROM public.subscriptions WHERE tenant_id = p_tenant::uuid;
$$;

-- 1. The plans after the change.
SELECT pg_temp.check((SELECT base_price_iqd = 9000 AND order_price_iqd = 55 AND max_team_members = 2 AND self_serve
                        AND extra_member_price_iqd IS NULL AND pos_branch_price_iqd IS NULL
                        FROM public.plan_limits WHERE plan = 'starter'), 'Start: 9,000 + 55, 2 members, no add-ons');
SELECT pg_temp.check((SELECT base_price_iqd = 25000 AND order_price_iqd = 55 AND max_team_members = 6 AND self_serve AND recommended
                        AND extra_member_price_iqd = 5000 AND pos_branch_price_iqd = 15000 AND pos_branches_included = 0
                        FROM public.plan_limits WHERE plan = 'growth'), 'Team: 25,000 + 55, 6 members, the highlighted plan');
SELECT pg_temp.check((SELECT base_price_iqd = 89000 AND order_price_iqd = 40 AND max_team_members = 20 AND self_serve AND NOT recommended
                        AND max_stores = 3 AND pos_branches_included = 1 AND extra_brand_price_iqd = 15000
                        FROM public.plan_limits WHERE plan = 'professional'), 'Business: 89,000 + 40, 20 members, 1 branch, 3 stores');
SELECT pg_temp.check((SELECT bool_and(NOT self_serve) FROM public.plan_limits WHERE plan IN ('enterprise', 'internal')),
                     'Custom and internal are never offered to merchants');
SELECT pg_temp.check((SELECT bool_and(max_orders_per_month = -1 AND trial_order_cap = 0 AND overage_price_iqd = 0) FROM public.plan_limits),
                     'no plan caps orders, in the trial or after');

INSERT INTO auth.users (id) VALUES ('90000000-0000-4000-8000-000000000001');
INSERT INTO public.tenants (id, plan, status, trial_ends_at) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'growth', 'trial', now() + interval '5 days'),
  ('a0000000-0000-4000-8000-00000000000b', 'starter', 'active', NULL),
  ('a0000000-0000-4000-8000-00000000000c', 'starter', 'active', NULL),
  ('a0000000-0000-4000-8000-00000000000d', 'professional', 'active', NULL),
  ('a0000000-0000-4000-8000-00000000000e', 'growth', 'active', NULL),
  ('a0000000-0000-4000-8000-00000000000f', 'internal', 'active', NULL);
INSERT INTO public.subscriptions (tenant_id, plan, status, current_period_start, current_period_end, pending_plan) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 'growth', 'trialing', now() - interval '2 days', now() + interval '5 days', NULL),
  ('a0000000-0000-4000-8000-00000000000b', 'starter', 'active', now() - interval '15 days', now() + interval '15 days', NULL),
  ('a0000000-0000-4000-8000-00000000000c', 'starter', 'active', now() - interval '15 days', now() + interval '15 days', NULL),
  ('a0000000-0000-4000-8000-00000000000d', 'professional', 'active', now() - interval '15 days', now() + interval '15 days', NULL),
  ('a0000000-0000-4000-8000-00000000000e', 'growth', 'active', now() - interval '31 days', now() - interval '1 day', 'starter'),
  ('a0000000-0000-4000-8000-00000000000f', 'internal', 'active', now() - interval '1 day', now() + interval '29 days', NULL);
INSERT INTO public.wallet (tenant_id, balance_iqd) VALUES
  ('a0000000-0000-4000-8000-00000000000a', 0),
  ('a0000000-0000-4000-8000-00000000000b', 20000),
  ('a0000000-0000-4000-8000-00000000000c', 1000),
  ('a0000000-0000-4000-8000-00000000000d', 100000),
  ('a0000000-0000-4000-8000-00000000000e', 100000),
  ('a0000000-0000-4000-8000-00000000000f', 0);

-- 2. Only the shop's admin changes its plan.
SELECT set_config('test.role', 'authenticated', false), set_config('test.uid', '90000000-0000-4000-8000-000000000001', false),
       set_config('test.admin_of', '', false);
SELECT pg_temp.check(pg_temp.raised($$SELECT public.change_plan('a0000000-0000-4000-8000-00000000000b', 'growth', true)$$) LIKE '42501/%',
                     'a member who is not the admin cannot change the plan');
SELECT pg_temp.check(pg_temp.raised($$SELECT public.set_addon_quantity('a0000000-0000-4000-8000-00000000000b', 'extra_member', 1, true)$$) LIKE '42501/%',
                     'a member who is not the admin cannot buy add-ons');

-- 3. In the trial the choice is the plan the first payment buys; nothing is charged.
SELECT pg_temp.as_admin('a0000000-0000-4000-8000-00000000000a');
SELECT pg_temp.check((SELECT r->>'kind' = 'pick' AND (r->>'charge_now_iqd')::numeric = 0 AND (r->>'monthly_iqd')::numeric = 9000
                        FROM public.change_plan('a0000000-0000-4000-8000-00000000000a', 'starter', false) r),
                     'trial quote: Start, 9,000 a month, nothing now');
SELECT pg_temp.check(pg_temp.pending_of('a0000000-0000-4000-8000-00000000000a') IS NULL, 'a quote changes nothing');
SELECT public.change_plan('a0000000-0000-4000-8000-00000000000a', 'starter', true);
SELECT pg_temp.check(pg_temp.pending_of('a0000000-0000-4000-8000-00000000000a') = 'starter'
                     AND pg_temp.plan_of('a0000000-0000-4000-8000-00000000000a') = 'growth',
                     'the trial stays on Team; Start waits for the payment');
SELECT pg_temp.check(public.team_seat_limit('a0000000-0000-4000-8000-00000000000a') = 2,
                     'with Start waiting, the team cannot grow past Start');
SELECT public.change_plan('a0000000-0000-4000-8000-00000000000a', 'growth', true);
SELECT pg_temp.check(pg_temp.pending_of('a0000000-0000-4000-8000-00000000000a') IS NULL
                     AND public.team_seat_limit('a0000000-0000-4000-8000-00000000000a') = 6,
                     'picking Team again clears the waiting plan');

-- 4. A plan the team does not fit is refused.
INSERT INTO public.user_profiles (id, email) VALUES
  ('91000000-0000-4000-8000-000000000001', 'a@example.test'),
  ('91000000-0000-4000-8000-000000000002', 'b@example.test'),
  ('91000000-0000-4000-8000-000000000003', 'c@example.test');
INSERT INTO public.tenant_members (tenant_id, user_id) VALUES
  ('a0000000-0000-4000-8000-00000000000a', '91000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-00000000000a', '91000000-0000-4000-8000-000000000002'),
  ('a0000000-0000-4000-8000-00000000000a', '91000000-0000-4000-8000-000000000003');
SELECT pg_temp.check((SELECT r->>'error' = 'too_many_members' AND (r->>'seats_used')::int = 3 AND (r->>'seat_limit')::int = 2
                        FROM public.change_plan('a0000000-0000-4000-8000-00000000000a', 'starter', true) r),
                     '3 members do not fit Start: refused with the numbers');
SELECT pg_temp.check(pg_temp.pending_of('a0000000-0000-4000-8000-00000000000a') IS NULL, 'the refused change wrote nothing');

-- 5. Custom and internal are not for sale; an internal shop has no plan to change.
SELECT pg_temp.check((SELECT r->>'error' FROM public.change_plan('a0000000-0000-4000-8000-00000000000a', 'enterprise', true) r) = 'not_offered',
                     'Custom is not self-serve');
SELECT pg_temp.check((SELECT r->>'error' FROM public.change_plan('a0000000-0000-4000-8000-00000000000a', 'internal', true) r) = 'not_offered',
                     'internal is not self-serve');
SELECT pg_temp.as_admin('a0000000-0000-4000-8000-00000000000f');
SELECT pg_temp.check((SELECT r->>'error' FROM public.change_plan('a0000000-0000-4000-8000-00000000000f', 'growth', true) r) = 'exempt',
                     'the internal shop keeps its plan');

-- 6. Upgrade in a paid month: now, the difference for the half month left.
SELECT pg_temp.as_admin('a0000000-0000-4000-8000-00000000000b');
SELECT pg_temp.check((SELECT r->>'kind' = 'upgrade' AND (r->>'charge_now_iqd')::numeric = 8000 AND (r->>'balance_ok')::boolean
                        FROM public.change_plan('a0000000-0000-4000-8000-00000000000b', 'growth', false) r),
                     'Start -> Team with half a month left: (25,000 - 9,000) / 2 = 8,000 now');
SELECT public.change_plan('a0000000-0000-4000-8000-00000000000b', 'growth', true);
SELECT pg_temp.check(pg_temp.plan_of('a0000000-0000-4000-8000-00000000000b') = 'growth'
                     AND (SELECT plan::text FROM public.subscriptions WHERE tenant_id = 'a0000000-0000-4000-8000-00000000000b') = 'growth',
                     'the upgrade is on now');
SELECT pg_temp.check(pg_temp.balance('a0000000-0000-4000-8000-00000000000b') = 12000, '8,000 taken from the wallet');
SELECT pg_temp.check((SELECT count(*) FROM public.wallet_transactions
                       WHERE tenant_id = 'a0000000-0000-4000-8000-00000000000b' AND type = 'charge'
                         AND reference_id LIKE 'plan_change:%' AND description = 'Plan upgrade to growth plan (rest of this month)') = 1,
                     'the upgrade charge is in the ledger once');
SELECT pg_temp.check((SELECT r->>'kind' FROM public.change_plan('a0000000-0000-4000-8000-00000000000b', 'growth', true) r) = 'keep'
                     AND pg_temp.balance('a0000000-0000-4000-8000-00000000000b') = 12000,
                     'pressing it twice charges once');

-- 7. Not enough in the wallet: refused, nothing changes.
SELECT pg_temp.as_admin('a0000000-0000-4000-8000-00000000000c');
SELECT pg_temp.check((SELECT r->>'error' = 'insufficient_balance' AND (r->>'charge_now_iqd')::numeric = 8000
                        FROM public.change_plan('a0000000-0000-4000-8000-00000000000c', 'growth', true) r),
                     'an upgrade the wallet cannot pay is refused with the amount');
SELECT pg_temp.check(pg_temp.plan_of('a0000000-0000-4000-8000-00000000000c') = 'starter'
                     AND pg_temp.balance('a0000000-0000-4000-8000-00000000000c') = 1000, 'and changes nothing');

-- 8. Downgrade: from the next renewal; staying calls it off.
SELECT pg_temp.as_admin('a0000000-0000-4000-8000-00000000000b');
SELECT pg_temp.check((SELECT r->>'kind' = 'downgrade' AND (r->>'charge_now_iqd')::numeric = 0
                             AND (r->>'effective_at')::timestamptz = (SELECT current_period_end FROM public.subscriptions WHERE tenant_id = 'a0000000-0000-4000-8000-00000000000b')
                        FROM public.change_plan('a0000000-0000-4000-8000-00000000000b', 'starter', true) r),
                     'Team -> Start waits for the renewal');
SELECT pg_temp.check(pg_temp.plan_of('a0000000-0000-4000-8000-00000000000b') = 'growth'
                     AND pg_temp.pending_of('a0000000-0000-4000-8000-00000000000b') = 'starter', 'still Team until then');
SELECT public.change_plan('a0000000-0000-4000-8000-00000000000b', 'growth', true);
SELECT pg_temp.check(pg_temp.pending_of('a0000000-0000-4000-8000-00000000000b') IS NULL, 'choosing Team again calls the downgrade off');

-- 9. The per-order fee follows the plan on the delivery day: Team 55, Business 40.
INSERT INTO public.orders (tenant_id, order_id, status) VALUES
  ('a0000000-0000-4000-8000-00000000000b', 'P1', 'delivered'),
  ('a0000000-0000-4000-8000-00000000000d', 'B1', 'delivered'),
  ('a0000000-0000-4000-8000-00000000000d', 'B2', 'cancelled');
SELECT pg_temp.check(pg_temp.balance('a0000000-0000-4000-8000-00000000000b') = 11945, 'Team delivered order: 55');
SELECT pg_temp.check(pg_temp.balance('a0000000-0000-4000-8000-00000000000d') = 99960, 'Business delivered order: 40, cancelled: 0');

-- 10. Add-ons: extra members on Team, charged for the half month left.
SELECT pg_temp.check((SELECT r->>'kind' = 'extra_member' AND (r->>'charge_now_iqd')::numeric = 5000 AND (r->>'monthly_iqd')::numeric = 35000
                        FROM public.set_addon_quantity('a0000000-0000-4000-8000-00000000000b', 'extra_member', 2, false) r),
                     '2 extra members: 5,000 now, 35,000 a month');
SELECT public.set_addon_quantity('a0000000-0000-4000-8000-00000000000b', 'extra_member', 2, true);
SELECT pg_temp.check(pg_temp.balance('a0000000-0000-4000-8000-00000000000b') = 6945, '5,000 taken');
SELECT pg_temp.check(public.team_seat_limit('a0000000-0000-4000-8000-00000000000b') = 8, 'Team 6 + 2 bought = 8 seats');
SELECT pg_temp.check(public.subscription_price_iqd('a0000000-0000-4000-8000-00000000000b', 'growth') = 35000
                     AND public.subscription_price_iqd('a0000000-0000-4000-8000-00000000000b', 'starter') = 9000,
                     'monthly price counts the add-ons the plan sells, and only those');
INSERT INTO public.user_profiles (id, email)
SELECT ('92000000-0000-4000-8000-00000000000' || g)::uuid, 'm' || g || '@example.test' FROM generate_series(1, 7) g;
INSERT INTO public.tenant_members (tenant_id, user_id)
SELECT 'a0000000-0000-4000-8000-00000000000b', ('92000000-0000-4000-8000-00000000000' || g)::uuid FROM generate_series(1, 7) g;
SELECT pg_temp.check((SELECT r->>'error' = 'in_use' AND (r->>'in_use')::int = 7 AND (r->>'limit')::int = 6
                        FROM public.set_addon_quantity('a0000000-0000-4000-8000-00000000000b', 'extra_member', 0, true) r),
                     'cannot give back a seat someone sits in');
SELECT pg_temp.check((SELECT r->>'error' = 'too_many_members' FROM public.change_plan('a0000000-0000-4000-8000-00000000000b', 'starter', true) r),
                     'a 7-person team cannot move to Start');
SELECT pg_temp.as_admin('a0000000-0000-4000-8000-00000000000c');
SELECT pg_temp.check((SELECT r->>'error' FROM public.set_addon_quantity('a0000000-0000-4000-8000-00000000000c', 'extra_member', 1, true) r) = 'not_on_plan',
                     'Start sells no extra members');
SELECT pg_temp.check((SELECT r->>'error' FROM public.set_addon_quantity('a0000000-0000-4000-8000-00000000000c', 'extra_brand', 1, true) r) = 'not_offered',
                     'extra brands are not sold yet');

-- 11. POS branches: Business includes one; a second needs one bought.
SELECT pg_temp.as_admin('a0000000-0000-4000-8000-00000000000d');
INSERT INTO public.shops (tenant_id, name) VALUES ('a0000000-0000-4000-8000-00000000000d', 'Main');
SELECT pg_temp.check(pg_temp.raised($$INSERT INTO public.shops (tenant_id, name) VALUES ('a0000000-0000-4000-8000-00000000000d', 'Second')$$) = 'PT402/BRANCH_LIMIT',
                     'a second branch needs a branch bought');
INSERT INTO public.shops (tenant_id, name, is_active) VALUES ('a0000000-0000-4000-8000-00000000000d', 'Closed', false);
SELECT pg_temp.check(pg_temp.raised($$UPDATE public.shops SET is_active = true WHERE name = 'Closed'$$) = 'PT402/BRANCH_LIMIT',
                     'switching a closed shop on counts too');
SELECT public.set_addon_quantity('a0000000-0000-4000-8000-00000000000d', 'pos_branch', 1, true);
SELECT pg_temp.check(pg_temp.balance('a0000000-0000-4000-8000-00000000000d') = 92460, 'a branch for half a month: 7,500');
SELECT pg_temp.check(pg_temp.raised($$UPDATE public.shops SET is_active = true WHERE name = 'Closed'$$) IS NULL,
                     'with a branch bought the shop opens');
SELECT pg_temp.check((SELECT r->>'error' FROM public.set_addon_quantity('a0000000-0000-4000-8000-00000000000d', 'pos_branch', 0, true) r) = 'in_use',
                     'cannot give back a branch that is open');
UPDATE public.shops SET is_active = false WHERE name = 'Closed';
SELECT pg_temp.check((SELECT (r->>'charged_iqd')::numeric = 0 FROM public.set_addon_quantity('a0000000-0000-4000-8000-00000000000d', 'pos_branch', 0, true) r),
                     'giving a branch back takes effect now, no refund');
SELECT pg_temp.check((SELECT r->>'error' FROM public.change_plan('a0000000-0000-4000-8000-00000000000d', 'starter', true) r) = 'too_many_branches',
                     'Start has no POS branch: an open shop blocks the move');

-- 12. Renewal: the waiting downgrade applies, add-ons Start does not sell are dropped.
INSERT INTO public.tenant_addons (tenant_id, kind, quantity) VALUES ('a0000000-0000-4000-8000-00000000000e', 'extra_member', 1);
SELECT pg_temp.check((SELECT r->>'outcome' = 'plan_changed' AND (r->>'charged')::numeric = 9000
                        FROM public.renew_subscription_core(
                               (SELECT id FROM public.subscriptions WHERE tenant_id = 'a0000000-0000-4000-8000-00000000000e'),
                               (SELECT current_period_end FROM public.subscriptions WHERE tenant_id = 'a0000000-0000-4000-8000-00000000000e')) r),
                     'renewal moves to Start and charges 9,000');
SELECT pg_temp.check(pg_temp.plan_of('a0000000-0000-4000-8000-00000000000e') = 'starter'
                     AND NOT EXISTS (SELECT 1 FROM public.tenant_addons WHERE tenant_id = 'a0000000-0000-4000-8000-00000000000e'),
                     'the extra member Start does not sell is gone');

-- 13. Renewal on Team with add-ons charges them.
UPDATE public.subscriptions SET current_period_start = now() - interval '31 days', current_period_end = now() - interval '1 day'
 WHERE tenant_id = 'a0000000-0000-4000-8000-00000000000b';
SELECT pg_temp.check((SELECT (r->>'charged')::numeric = 35000
                        FROM public.renew_subscription_core(
                               (SELECT id FROM public.subscriptions WHERE tenant_id = 'a0000000-0000-4000-8000-00000000000b'),
                               (SELECT current_period_end FROM public.subscriptions WHERE tenant_id = 'a0000000-0000-4000-8000-00000000000b')) r)
                     IS NOT TRUE,
                     'Team + 2 members (35,000) is not paid from 6,945');
SELECT pg_temp.check((SELECT status::text FROM public.subscriptions WHERE tenant_id = 'a0000000-0000-4000-8000-00000000000b') = 'past_due',
                     'so the shop is locked, not charged a part');
