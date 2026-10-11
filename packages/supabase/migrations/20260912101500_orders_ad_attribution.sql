-- =============================================
-- Orders: ad attribution (which channel the customer actually came from)
--
-- `orders.source` answers "which system sent us this order" — for every
-- LightFunnels order it says 'lightfunnels', which is useless for deciding where
-- the ad budget goes. LightFunnels itself knows: it exposes `utm { k v }` on both
-- Order and Checkout. Verified live on 2026-09-12: order #7401 carried
-- source=fb / medium=Facebook_Mobile_Reels, #7402 source=ig / Instagram_Reels,
-- both with campaign, creative, ad id and adset id.
--
-- `attribution` keeps the normalized record; `ad_channel` is denormalized out of
-- it so the orders list can filter and reports can group without unpacking jsonb
-- on every row.
-- =============================================

alter table public.orders
    add column if not exists attribution jsonb,
    add column if not exists ad_channel text;

comment on column public.orders.attribution is
    'Normalized ad attribution from the source platform: {channel, source, medium, campaign, content, adId, term}.';

comment on column public.orders.ad_channel is
    'Denormalized attribution.channel (facebook|instagram|tiktok|snapchat|google|youtube|other) so the list can filter and group without unpacking jsonb.';

-- Deliberately no CHECK on ad_channel: a new ad network must be able to land in
-- the data before this codebase learns its name.
create index if not exists idx_orders_tenant_ad_channel
    on public.orders (tenant_id, ad_channel)
    where ad_channel is not null;

-- RLS is already enabled on public.orders and every policy is row-level and
-- tenant-scoped, so these columns inherit that gating.
