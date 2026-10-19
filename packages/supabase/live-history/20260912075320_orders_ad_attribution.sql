-- Where the order came from as an ad, not as a system. `orders.source` only ever
-- says 'lightfunnels'; LightFunnels itself knows the customer clicked a Facebook
-- Reel or an Instagram Reel and exposes it as `utm { k v }`.
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
    where ad_channel is not null;;
