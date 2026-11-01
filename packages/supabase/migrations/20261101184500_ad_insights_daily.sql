-- Ad-level Meta insights (campaign > ad set > ad), one row per tenant / day / ad.
-- Written by the Meta sync only. Money data, so only tenant admins read it,
-- same as ad_spend_daily. Spend is stored in USD and whole IQD at the rate used.
-- frequency is Meta's own average impressions per person for that day; it is
-- not additive, so it is stored per day and never summed.

CREATE TABLE IF NOT EXISTS public.ad_insights_daily (
    tenant_id      UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    spend_date     DATE NOT NULL,
    ad_id          TEXT NOT NULL,
    ad_name        TEXT NOT NULL,
    adset_id       TEXT NOT NULL,
    adset_name     TEXT NOT NULL,
    campaign_id    TEXT NOT NULL,
    spend_usd      NUMERIC(12,2) NOT NULL CHECK (spend_usd >= 0),
    spend_iqd      BIGINT NOT NULL CHECK (spend_iqd >= 0),
    impressions    BIGINT NOT NULL DEFAULT 0,
    clicks         BIGINT NOT NULL DEFAULT 0,
    results        INTEGER NOT NULL DEFAULT 0,
    frequency      NUMERIC(8,3) NOT NULL DEFAULT 0 CHECK (frequency >= 0),
    synced_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, spend_date, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_ad_insights_daily_tenant_date
    ON public.ad_insights_daily (tenant_id, spend_date DESC);

ALTER TABLE public.ad_insights_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ad_insights_daily_admin_read ON public.ad_insights_daily;
CREATE POLICY ad_insights_daily_admin_read ON public.ad_insights_daily
    FOR SELECT TO authenticated
    USING (public.is_tenant_admin(tenant_id));

REVOKE ALL ON public.ad_insights_daily FROM anon, authenticated;
GRANT SELECT ON public.ad_insights_daily TO authenticated;
