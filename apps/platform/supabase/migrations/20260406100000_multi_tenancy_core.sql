-- =============================================
-- PHASE 1: MULTI-TENANCY CORE TABLES
-- Run after: 20260101000000_base_schema.sql
-- =============================================

-- Enums
CREATE TYPE public.plan_tier AS ENUM ('starter', 'growth', 'professional', 'enterprise');
CREATE TYPE public.tenant_status AS ENUM ('trial', 'active', 'suspended', 'cancelled');
CREATE TYPE public.subscription_status AS ENUM ('trialing', 'active', 'past_due', 'cancelled', 'incomplete');
CREATE TYPE public.member_status AS ENUM ('pending', 'active', 'suspended');

-- =============================================
-- 1. TENANTS
-- =============================================
CREATE TABLE public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    plan plan_tier NOT NULL DEFAULT 'starter',
    status tenant_status NOT NULL DEFAULT 'trial',
    trial_ends_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    branding JSONB NOT NULL DEFAULT '{"logo_url":null,"primary_color":"#3b82f6","secondary_color":"#8b5cf6"}'::jsonb,
    settings JSONB NOT NULL DEFAULT '{"timezone":"Asia/Baghdad","language":"ar","currency":"IQD"}'::jsonb,
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT,
    city TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX idx_tenants_slug ON public.tenants(slug);
CREATE INDEX idx_tenants_status ON public.tenants(status);

-- =============================================
-- 2. PLAN LIMITS
-- =============================================
CREATE TABLE public.plan_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan plan_tier UNIQUE NOT NULL,
    max_orders_per_month INTEGER NOT NULL,
    max_team_members INTEGER NOT NULL,
    order_price_iqd INTEGER NOT NULL DEFAULT 100,
    overage_price_iqd INTEGER NOT NULL DEFAULT 500,
    base_price_iqd INTEGER NOT NULL DEFAULT 0,
    features JSONB NOT NULL DEFAULT '{"whatsapp_automation":false,"custom_branding":false,"api_access":false,"priority_support":false,"advanced_analytics":false,"custom_storefront":false}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.plan_limits (plan, max_orders_per_month, max_team_members, base_price_iqd, order_price_iqd, overage_price_iqd, features)
VALUES
    ('starter',      500,    3,  10000,  100, 500, '{"whatsapp_automation":false,"custom_branding":false,"api_access":false,"priority_support":false,"advanced_analytics":false,"custom_storefront":false}'),
    ('growth',       2000,   8,  30000,  100, 500, '{"whatsapp_automation":true,"custom_branding":false,"api_access":false,"priority_support":false,"advanced_analytics":true,"custom_storefront":false}'),
    ('professional', 10000,  20, 70000,  100, 500, '{"whatsapp_automation":true,"custom_branding":true,"api_access":true,"priority_support":true,"advanced_analytics":true,"custom_storefront":true}'),
    ('enterprise',   -1,     -1, 100000, 100, 500, '{"whatsapp_automation":true,"custom_branding":true,"api_access":true,"priority_support":true,"advanced_analytics":true,"custom_storefront":true}');

-- =============================================
-- 3. SUBSCRIPTIONS
-- =============================================
CREATE TABLE public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan plan_tier NOT NULL,
    status subscription_status NOT NULL,
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    pending_plan plan_tier,
    plan_change_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    cancellation_feedback TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_tenant_id ON public.subscriptions(tenant_id);

-- =============================================
-- 4. WALLET (prepaid billing)
-- =============================================
CREATE TABLE public.wallet (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID UNIQUE NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    balance_iqd NUMERIC NOT NULL DEFAULT 0,
    threshold_iqd NUMERIC NOT NULL DEFAULT 5000,
    total_charged_iqd NUMERIC NOT NULL DEFAULT 0,
    total_topped_up_iqd NUMERIC NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.wallet_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('topup', 'charge', 'refund', 'adjustment')),
    amount_iqd NUMERIC NOT NULL,
    balance_after_iqd NUMERIC NOT NULL,
    description TEXT,
    reference_id TEXT,
    payment_method TEXT CHECK (payment_method IN ('zain_cash', 'qi_card', 'bank_transfer', 'manual')),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_wallet_transactions_tenant_id ON public.wallet_transactions(tenant_id);
CREATE INDEX idx_wallet_transactions_created_at ON public.wallet_transactions(tenant_id, created_at DESC);

-- =============================================
-- 5. USAGE TRACKING
-- =============================================
CREATE TABLE public.usage_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    orders_count INTEGER NOT NULL DEFAULT 0,
    orders_charged INTEGER NOT NULL DEFAULT 0,
    team_members_count INTEGER NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(tenant_id, year, month)
);

CREATE INDEX idx_usage_tracking_tenant_period ON public.usage_tracking(tenant_id, year, month);

-- =============================================
-- 6. TENANT MEMBERS
-- =============================================
CREATE TABLE public.tenant_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    invited_by UUID REFERENCES public.user_profiles(id),
    invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    joined_at TIMESTAMPTZ,
    status member_status NOT NULL DEFAULT 'active',
    UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_members_tenant_id ON public.tenant_members(tenant_id);
CREATE INDEX idx_tenant_members_user_id ON public.tenant_members(user_id);

-- =============================================
-- 7. Add current_tenant_id to user_profiles
-- =============================================
ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS current_tenant_id UUID REFERENCES public.tenants(id);

-- =============================================
-- 8. RLS POLICIES
-- =============================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their tenant"
    ON public.tenants FOR SELECT
    USING (id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND status = 'active'));
CREATE POLICY "Admin members can update their tenant"
    ON public.tenants FOR UPDATE
    USING (id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'));

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their subscription"
    ON public.subscriptions FOR SELECT
    USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND status = 'active'));

ALTER TABLE public.wallet ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their wallet"
    ON public.wallet FOR SELECT
    USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND status = 'active'));

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their wallet transactions"
    ON public.wallet_transactions FOR SELECT
    USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND status = 'active'));

ALTER TABLE public.usage_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view their usage"
    ON public.usage_tracking FOR SELECT
    USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members WHERE user_id = auth.uid() AND status = 'active'));

ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members can view tenant members"
    ON public.tenant_members FOR SELECT
    USING (tenant_id IN (SELECT tenant_id FROM public.tenant_members tm2 WHERE tm2.user_id = auth.uid() AND tm2.status = 'active'));

ALTER TABLE public.plan_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone authenticated can view plan limits"
    ON public.plan_limits FOR SELECT TO authenticated USING (true);

-- =============================================
-- 9. HELPER FUNCTIONS
-- =============================================

CREATE OR REPLACE FUNCTION public.get_current_tenant_id()
RETURNS UUID AS $$
    SELECT current_tenant_id FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_tenant_admin(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.tenant_members
        WHERE tenant_id = p_tenant_id AND user_id = auth.uid() AND role = 'admin' AND status = 'active'
    );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.increment_order_usage(p_tenant_id UUID)
RETURNS void AS $$
    INSERT INTO public.usage_tracking (tenant_id, year, month, orders_count, orders_charged)
    VALUES (p_tenant_id, EXTRACT(YEAR FROM now())::int, EXTRACT(MONTH FROM now())::int, 1, 1)
    ON CONFLICT (tenant_id, year, month)
    DO UPDATE SET
        orders_count = usage_tracking.orders_count + 1,
        orders_charged = usage_tracking.orders_charged + 1,
        last_updated_at = now();
$$ LANGUAGE sql SECURITY DEFINER;
