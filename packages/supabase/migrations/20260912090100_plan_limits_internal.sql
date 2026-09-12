-- =============================================
-- Limits for the `internal` house tier: unlimited, free, every feature on.
--
-- -1 is the existing "unlimited" sentinel that `canCreateOrder` already honours
-- (enterprise uses it for max_orders_per_month). Prices are zero so that even if
-- a charge path is reached by accident, it can never fail for lack of balance.
--
-- Separate migration from the enum value on purpose: Postgres will not let a new
-- enum label be used in the same transaction that adds it.
-- =============================================

insert into plan_limits (
    plan,
    max_orders_per_month,
    max_team_members,
    order_price_iqd,
    overage_price_iqd,
    base_price_iqd,
    features
)
values (
    'internal',
    -1,
    -1,
    0,
    0,
    0,
    '{"api_access": true, "custom_branding": true, "priority_support": true, "custom_storefront": true, "advanced_analytics": true, "whatsapp_automation": true}'::jsonb
)
on conflict (plan) do update set
    max_orders_per_month = excluded.max_orders_per_month,
    max_team_members     = excluded.max_team_members,
    order_price_iqd      = excluded.order_price_iqd,
    overage_price_iqd    = excluded.overage_price_iqd,
    base_price_iqd       = excluded.base_price_iqd,
    features             = excluded.features,
    updated_at           = now();
