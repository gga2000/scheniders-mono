-- Limits row for the house tier: unlimited, free, every feature on.
-- -1 is the existing "unlimited" sentinel (enterprise already uses it).
insert into plan_limits (plan, max_orders_per_month, max_team_members, order_price_iqd, overage_price_iqd, base_price_iqd, features)
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
    max_team_members = excluded.max_team_members,
    order_price_iqd = excluded.order_price_iqd,
    overage_price_iqd = excluded.overage_price_iqd,
    base_price_iqd = excluded.base_price_iqd,
    features = excluded.features,
    updated_at = now();;
