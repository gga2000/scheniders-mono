-- Meta (Facebook/Instagram) ad spend tracking.
--
-- meta_ads_connections: one row per tenant holding the Meta ad account id and
-- a read-only (ads_read) access token. The token is a secret, so NO browser
-- role can read this table: only the service role (server routes + cron).
-- The settings screen gets a masked status from a tenant-admin API route.
--
-- ad_spend_daily: one row per tenant / day / campaign, written by the sync
-- only. Tenant members can read their own rows. Spend is kept in USD (the
-- ad account currency) and converted to whole IQD at sync time with the
-- tenant's configured rate; the rate used is stored on each row.

CREATE TABLE IF NOT EXISTS public.meta_ads_connections (
    tenant_id        UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    ad_account_id    TEXT NOT NULL CHECK (ad_account_id ~ '^[0-9]{5,20}$'),
    access_token     TEXT NOT NULL CHECK (length(access_token) > 20),
    usd_to_iqd       INTEGER NOT NULL CHECK (usd_to_iqd BETWEEN 1000 AND 3000),
    is_active        BOOLEAN NOT NULL DEFAULT true,
    last_synced_at   TIMESTAMPTZ,
    last_error       TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_ads_connections ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: deny all to anon/authenticated. Service role bypasses RLS.
REVOKE ALL ON public.meta_ads_connections FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.ad_spend_daily (
    tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    spend_date     DATE NOT NULL,
    campaign_id    TEXT NOT NULL,
    campaign_name  TEXT NOT NULL,
    spend_usd      NUMERIC(12,2) NOT NULL CHECK (spend_usd >= 0),
    usd_to_iqd     INTEGER NOT NULL,
    spend_iqd      BIGINT NOT NULL CHECK (spend_iqd >= 0),
    impressions    BIGINT NOT NULL DEFAULT 0,
    clicks         BIGINT NOT NULL DEFAULT 0,
    results        INTEGER NOT NULL DEFAULT 0,
    synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, spend_date, campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_daily_tenant_date
    ON public.ad_spend_daily (tenant_id, spend_date DESC);

ALTER TABLE public.ad_spend_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY ad_spend_daily_member_read ON public.ad_spend_daily
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT get_user_tenant_ids()));

REVOKE ALL ON public.ad_spend_daily FROM anon, authenticated;
GRANT SELECT ON public.ad_spend_daily TO authenticated;
