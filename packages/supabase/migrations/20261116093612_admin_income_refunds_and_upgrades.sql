-- Staff console: "Our fees" takes off refunds, and counts upgrade and add-on
-- payments as monthly-plan money.
--
-- admin_income_facts took in charge rows only. When a delivered order is
-- returned, refund_wallet_charge_core pays its fee back as a 'refund' row
-- ('delivered:<id>#n'), so the console kept counting a fee we gave back.
-- Upgrade part-payments ('plan_change:...') and add-on fees ('addon:...') are
-- what a shop pays for its plan, but they fell into "other", which the revenue
-- page calls corrections and test reversals.
--
-- Every reader of the view (admin_income_stats, admin_merchant_list_stats)
-- only sums amount_iqd, so a refund row now counts against its kind.

CREATE OR REPLACE VIEW public.admin_income_facts
WITH (security_invoker = true) AS
SELECT
    wt.id,
    wt.tenant_id,
    wt.created_at,
    (wt.created_at AT TIME ZONE 'Asia/Baghdad') AS created_local,
    -- The ledger stores a charge as a negative amount and a refund as a
    -- positive one: a fee counts plus, the refund of it counts minus.
    -wt.amount_iqd AS amount_iqd,
    CASE
        WHEN wt.reference_id LIKE 'subscription:%'
          OR wt.reference_id LIKE 'plan_change:%'
          OR wt.reference_id LIKE 'addon:%' THEN 'subscription'
        WHEN wt.reference_id LIKE 'delivered:%' THEN 'orders'
        WHEN wt.reference_id LIKE 'whatsapp:%' THEN 'whatsapp'
        ELSE 'other'
    END AS kind
FROM public.wallet_transactions wt
WHERE wt.type IN ('charge', 'refund');

COMMENT ON VIEW public.admin_income_facts IS
    'Our fees for the staff console: wallet charges less their refunds, sorted into subscription (plan, upgrade, add-on), orders, whatsapp and other. Service role only.';

REVOKE ALL ON public.admin_income_facts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admin_income_facts TO service_role;
