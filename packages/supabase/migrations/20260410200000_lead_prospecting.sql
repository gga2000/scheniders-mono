-- =============================================
-- LEAD PROSPECTING SYSTEM
-- Potential merchants CRM, pipeline, gamified cards,
-- employee tracking, commissions, achievements
-- =============================================

-- ────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────

CREATE TYPE public.lead_status AS ENUM (
  'new', 'contacted', 'interested', 'store_built', 'converted', 'lost'
);

CREATE TYPE public.lead_priority AS ENUM (
  'low', 'medium', 'high', 'urgent'
);

CREATE TYPE public.lead_source_platform AS ENUM (
  'instagram', 'facebook', 'tiktok', 'snapchat',
  'youtube', 'twitter', 'linkedin', 'website',
  'referral', 'cold_call', 'other'
);

CREATE TYPE public.lead_activity_type AS ENUM (
  'note', 'call', 'whatsapp', 'email', 'meeting',
  'status_change', 'assignment_change', 'store_created',
  'follow_up', 'conversion', 'score_change', 'tag_change'
);

CREATE TYPE public.lead_tier AS ENUM (
  'bronze', 'silver', 'gold', 'diamond', 'legendary'
);

CREATE TYPE public.competitor_relationship AS ENUM (
  'direct', 'indirect', 'substitute'
);

CREATE TYPE public.commission_type AS ENUM (
  'per_order', 'percentage', 'tiered_bonus', 'custom'
);

CREATE TYPE public.commission_status AS ENUM (
  'pending', 'approved', 'paid'
);

-- ────────────────────────────────────────────────
-- 1. INDUSTRIES (managed list)
-- ────────────────────────────────────────────────

CREATE TABLE public.industries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    name_ar TEXT,
    icon TEXT DEFAULT 'Building2',
    color TEXT DEFAULT '#6B7280',
    avg_order_value_iqd INTEGER DEFAULT 25000,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.industries (name, name_ar, icon, color, avg_order_value_iqd, sort_order) VALUES
    ('Fashion & Clothing', 'أزياء وملابس', 'Shirt', '#FF8899', 35000, 1),
    ('Beauty & Cosmetics', 'جمال ومستحضرات تجميل', 'Sparkles', '#FF69B4', 28000, 2),
    ('Electronics', 'إلكترونيات', 'Smartphone', '#60A5FA', 75000, 3),
    ('Food & Beverages', 'طعام ومشروبات', 'UtensilsCrossed', '#F59E0B', 15000, 4),
    ('Home & Furniture', 'منزل وأثاث', 'Sofa', '#8B5CF6', 65000, 5),
    ('Health & Wellness', 'صحة وعافية', 'Heart', '#34D399', 30000, 6),
    ('Sports & Fitness', 'رياضة ولياقة', 'Dumbbell', '#F97316', 40000, 7),
    ('Jewelry & Accessories', 'مجوهرات وإكسسوارات', 'Gem', '#EFFF00', 50000, 8),
    ('Kids & Baby', 'أطفال ورضع', 'Baby', '#A78BFA', 20000, 9),
    ('Books & Stationery', 'كتب وقرطاسية', 'BookOpen', '#6EE7B7', 12000, 10),
    ('Automotive', 'سيارات', 'Car', '#94A3B8', 100000, 11),
    ('Grocery', 'بقالة', 'ShoppingBasket', '#22C55E', 18000, 12),
    ('Other', 'أخرى', 'Package', '#6B7280', 25000, 99);

-- ────────────────────────────────────────────────
-- 2. LEADS (core table)
-- ────────────────────────────────────────────────

CREATE TABLE public.leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Business info
    merchant_name TEXT NOT NULL,
    industry_id UUID REFERENCES public.industries(id) ON DELETE SET NULL,
    platform lead_source_platform NOT NULL DEFAULT 'instagram',
    platform_url TEXT,
    follower_count INTEGER NOT NULL DEFAULT 0,

    -- Contact: Management
    management_name TEXT,
    management_info TEXT,

    -- Contact: Page phone
    page_phone TEXT,

    -- Contact: Multiple phone numbers (up to 3)
    -- Schema: [{"title": "Owner Mobile", "number": "07xxxxxxxxx"}, ...]
    phone_numbers JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Social metrics
    avg_view_count INTEGER NOT NULL DEFAULT 0,
    avg_like_count INTEGER NOT NULL DEFAULT 0,
    avg_comments_count INTEGER NOT NULL DEFAULT 0,
    avg_order_count INTEGER NOT NULL DEFAULT 0,

    -- Predictions (computed from avg_view_count)
    estimated_daily_orders INTEGER NOT NULL DEFAULT 0,
    estimated_monthly_revenue BIGINT NOT NULL DEFAULT 0,

    -- Location
    address TEXT,
    city TEXT,
    governorate_code TEXT,

    -- Pipeline
    status lead_status NOT NULL DEFAULT 'new',
    priority lead_priority NOT NULL DEFAULT 'medium',

    -- Scoring
    lead_score INTEGER NOT NULL DEFAULT 0,
    score_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Tier (computed from follower_count)
    tier lead_tier NOT NULL DEFAULT 'bronze',

    -- Assignment
    assigned_to UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    assigned_at TIMESTAMPTZ,

    -- Pre-built store
    prospect_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    store_built_at TIMESTAMPTZ,

    -- Conversion
    converted_tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    converted_at TIMESTAMPTZ,

    -- Source tracking
    source_campaign TEXT,
    source_medium TEXT,
    source_referrer TEXT,

    -- Tags and custom fields
    tags TEXT[] DEFAULT '{}',
    custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Duplicate detection (normalized)
    normalized_phone TEXT,
    normalized_name TEXT,

    -- Staleness tracking
    last_contacted_at TIMESTAMPTZ,
    next_follow_up_at TIMESTAMPTZ,

    -- Audit
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance indexes
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_priority ON public.leads(priority);
CREATE INDEX idx_leads_assigned_to ON public.leads(assigned_to);
CREATE INDEX idx_leads_lead_score ON public.leads(lead_score DESC);
CREATE INDEX idx_leads_created_at ON public.leads(created_at DESC);
CREATE INDEX idx_leads_converted_tenant ON public.leads(converted_tenant_id) WHERE converted_tenant_id IS NOT NULL;
CREATE INDEX idx_leads_prospect_tenant ON public.leads(prospect_tenant_id) WHERE prospect_tenant_id IS NOT NULL;
CREATE INDEX idx_leads_normalized_phone ON public.leads(normalized_phone) WHERE normalized_phone IS NOT NULL;
CREATE INDEX idx_leads_normalized_name ON public.leads(normalized_name) WHERE normalized_name IS NOT NULL;
CREATE INDEX idx_leads_next_follow_up ON public.leads(next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL AND status NOT IN ('converted', 'lost');
CREATE INDEX idx_leads_platform ON public.leads(platform);
CREATE INDEX idx_leads_industry_id ON public.leads(industry_id) WHERE industry_id IS NOT NULL;
CREATE INDEX idx_leads_tier ON public.leads(tier);
CREATE INDEX idx_leads_tags ON public.leads USING GIN (tags);

-- Full-text search
CREATE INDEX idx_leads_search ON public.leads
  USING GIN (to_tsvector('simple',
    COALESCE(merchant_name, '') || ' ' ||
    COALESCE(management_name, '') || ' ' ||
    COALESCE(city, '') || ' ' ||
    COALESCE(page_phone, '')
  ));

-- ────────────────────────────────────────────────
-- 3. LEAD ACTIVITIES (timeline / comms log)
-- ────────────────────────────────────────────────

CREATE TABLE public.lead_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    activity_type lead_activity_type NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_activities_lead_id ON public.lead_activities(lead_id, created_at DESC);
CREATE INDEX idx_lead_activities_type ON public.lead_activities(activity_type);

-- ────────────────────────────────────────────────
-- 4. LEAD FOLLOW-UPS (scheduled reminders)
-- ────────────────────────────────────────────────

CREATE TABLE public.lead_follow_ups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    assigned_to UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    scheduled_at TIMESTAMPTZ NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_follow_ups_lead ON public.lead_follow_ups(lead_id);
CREATE INDEX idx_lead_follow_ups_pending ON public.lead_follow_ups(assigned_to, scheduled_at)
  WHERE is_completed = false;
CREATE INDEX idx_lead_follow_ups_scheduled ON public.lead_follow_ups(scheduled_at)
  WHERE is_completed = false;

-- ────────────────────────────────────────────────
-- 5. LEAD SOCIAL LINKS
-- ────────────────────────────────────────────────

CREATE TABLE public.lead_social_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    url TEXT NOT NULL,
    username TEXT,
    follower_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_lead_social_links_lead ON public.lead_social_links(lead_id);

-- ────────────────────────────────────────────────
-- 6. LEAD COMPETITORS (many-to-many)
-- ────────────────────────────────────────────────

CREATE TABLE public.lead_competitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    competitor_lead_id UUID REFERENCES public.leads(id) ON DELETE CASCADE,
    competitor_tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    relationship_type competitor_relationship NOT NULL DEFAULT 'direct',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT competitor_target_check CHECK (
      (competitor_lead_id IS NOT NULL AND competitor_tenant_id IS NULL) OR
      (competitor_lead_id IS NULL AND competitor_tenant_id IS NOT NULL)
    )
);

CREATE INDEX idx_lead_competitors_lead ON public.lead_competitors(lead_id);
CREATE INDEX idx_lead_competitors_target_lead ON public.lead_competitors(competitor_lead_id) WHERE competitor_lead_id IS NOT NULL;
CREATE INDEX idx_lead_competitors_target_tenant ON public.lead_competitors(competitor_tenant_id) WHERE competitor_tenant_id IS NOT NULL;

-- ────────────────────────────────────────────────
-- 7. WHATSAPP OUTREACH TEMPLATES
-- ────────────────────────────────────────────────

CREATE TABLE public.whatsapp_outreach_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    stage lead_status NOT NULL,
    message_template TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.whatsapp_outreach_templates (name, stage, message_template) VALUES
    ('Initial Contact', 'new',
     'مرحباً {{merchant_name}}، نحن فريق شنايدرز ولاحظنا نشاطكم المميز! نقدر نساعدكم تطوروا مبيعاتكم اونلاين. هل عندكم وقت لمكالمة قصيرة؟'),
    ('Follow Up', 'contacted',
     'مرحباً {{merchant_name}}، تواصلنا معكم سابقاً بخصوص منصة شنايدرز. هل حابين نشرح لكم أكثر عن كيف ممكن نزيد مبيعاتكم؟'),
    ('Store Ready', 'store_built',
     'مرحباً {{merchant_name}}! جهزنا لكم متجر كامل جاهز بمنتجاتكم 🎉 شوفوه من هنا: {{store_link}} - ممكن تبدون تستخدمونه اليوم!'),
    ('Negotiation', 'interested',
     'مرحباً {{merchant_name}}، سعيدين باهتمامكم! عندنا عروض خاصة للتجار الجدد. متى نقدر نحجز موعد نتكلم عن التفاصيل؟');

-- ────────────────────────────────────────────────
-- 8. MODIFY TENANTS TABLE (prospect flag)
-- ────────────────────────────────────────────────

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS is_prospect BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS prospect_lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL;

CREATE INDEX idx_tenants_is_prospect ON public.tenants(is_prospect) WHERE is_prospect = true;

-- ────────────────────────────────────────────────
-- 9. ADMIN EMPLOYEE TRACKING
-- ────────────────────────────────────────────────

CREATE TABLE public.admin_employee_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_admin_tracking_user ON public.admin_employee_tracking(admin_user_id, created_at DESC);
CREATE INDEX idx_admin_tracking_action ON public.admin_employee_tracking(action);
CREATE INDEX idx_admin_tracking_created ON public.admin_employee_tracking(created_at DESC);

-- ────────────────────────────────────────────────
-- 10. COMMISSION CONFIG
-- ────────────────────────────────────────────────

CREATE TABLE public.admin_commission_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    type commission_type NOT NULL DEFAULT 'per_order',
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT false,
    created_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert default commission configs
INSERT INTO public.admin_commission_config (name, type, config, is_active) VALUES
    ('Per Order', 'per_order', '{"rate_per_order": 250, "currency": "IQD"}', true),
    ('Revenue Percentage', 'percentage', '{"percentage": 2.5, "of": "order_revenue"}', false),
    ('Tiered Bonus', 'tiered_bonus', '{"tiers": [{"min_orders": 0, "max_orders": 100, "rate": 200}, {"min_orders": 101, "max_orders": 500, "rate": 300}, {"min_orders": 501, "rate": 400}]}', false);

-- ────────────────────────────────────────────────
-- 11. EMPLOYEE COMMISSIONS (calculated records)
-- ────────────────────────────────────────────────

CREATE TABLE public.admin_employee_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    commission_config_id UUID REFERENCES public.admin_commission_config(id) ON DELETE SET NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    orders_count INTEGER NOT NULL DEFAULT 0,
    order_revenue INTEGER NOT NULL DEFAULT 0,
    amount_earned INTEGER NOT NULL DEFAULT 0,
    status commission_status NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    paid_by UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT period_valid CHECK (period_start <= period_end)
);

CREATE INDEX idx_commissions_user ON public.admin_employee_commissions(admin_user_id, period_start DESC);
CREATE INDEX idx_commissions_status ON public.admin_employee_commissions(status);
CREATE INDEX idx_commissions_period ON public.admin_employee_commissions(period_start, period_end);
CREATE INDEX idx_commissions_tenant ON public.admin_employee_commissions(tenant_id) WHERE tenant_id IS NOT NULL;

-- ────────────────────────────────────────────────
-- 12. EMPLOYEE ACHIEVEMENTS
-- ────────────────────────────────────────────────

CREATE TABLE public.admin_employee_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    achievement_key TEXT NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE(admin_user_id, achievement_key)
);

CREATE INDEX idx_achievements_user ON public.admin_employee_achievements(admin_user_id);

-- ────────────────────────────────────────────────
-- 13. FUNCTIONS: Tier calculation
-- ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_lead_tier(p_follower_count INTEGER)
RETURNS lead_tier AS $$
BEGIN
    IF p_follower_count >= 100000 THEN RETURN 'legendary';
    ELSIF p_follower_count >= 50000 THEN RETURN 'diamond';
    ELSIF p_follower_count >= 10000 THEN RETURN 'gold';
    ELSIF p_follower_count >= 1000 THEN RETURN 'silver';
    ELSE RETURN 'bronze';
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ────────────────────────────────────────────────
-- 14. FUNCTIONS: Order prediction
-- ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_lead_predictions(
    p_avg_view_count INTEGER,
    p_industry_id UUID
)
RETURNS TABLE(daily_orders INTEGER, monthly_revenue BIGINT) AS $$
DECLARE
    v_daily INTEGER;
    v_avg_order_value INTEGER;
BEGIN
    v_daily := GREATEST(ROUND(p_avg_view_count / 1000.0)::INTEGER, 0);

    SELECT COALESCE(i.avg_order_value_iqd, 25000)
    INTO v_avg_order_value
    FROM public.industries i
    WHERE i.id = p_industry_id;

    IF NOT FOUND THEN
        v_avg_order_value := 25000;
    END IF;

    daily_orders := v_daily;
    monthly_revenue := v_daily * 30 * v_avg_order_value;
    RETURN NEXT;
END;
$$ LANGUAGE plpgsql STABLE;

-- ────────────────────────────────────────────────
-- 15. FUNCTIONS: Lead scoring
-- ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_lead_score(p_lead_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_score INTEGER := 0;
    v_lead RECORD;
    v_breakdown JSONB := '{}'::jsonb;
    v_engagement_rate NUMERIC;
    v_followers_score INTEGER := 0;
    v_engagement_score INTEGER := 0;
    v_orders_score INTEGER := 0;
    v_contact_score INTEGER := 0;
    v_platform_score INTEGER := 0;
    v_responsiveness_score INTEGER := 0;
    v_store_score INTEGER := 0;
BEGIN
    SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
    IF NOT FOUND THEN RETURN 0; END IF;

    -- Follower count (0-20 pts)
    IF v_lead.follower_count >= 100000 THEN v_followers_score := 20;
    ELSIF v_lead.follower_count >= 50000 THEN v_followers_score := 16;
    ELSIF v_lead.follower_count >= 10000 THEN v_followers_score := 12;
    ELSIF v_lead.follower_count >= 5000 THEN v_followers_score := 8;
    ELSIF v_lead.follower_count >= 1000 THEN v_followers_score := 4;
    ELSE v_followers_score := 1;
    END IF;

    -- Engagement rate (0-20 pts)
    IF v_lead.follower_count > 0 THEN
        v_engagement_rate := (COALESCE(v_lead.avg_like_count, 0) + COALESCE(v_lead.avg_comments_count, 0))::NUMERIC
                             / v_lead.follower_count * 100;
        IF v_engagement_rate >= 5 THEN v_engagement_score := 20;
        ELSIF v_engagement_rate >= 3 THEN v_engagement_score := 15;
        ELSIF v_engagement_rate >= 1 THEN v_engagement_score := 10;
        ELSE v_engagement_score := 5;
        END IF;
    END IF;

    -- Estimated order volume (0-15 pts)
    IF v_lead.estimated_daily_orders >= 50 THEN v_orders_score := 15;
    ELSIF v_lead.estimated_daily_orders >= 20 THEN v_orders_score := 12;
    ELSIF v_lead.estimated_daily_orders >= 5 THEN v_orders_score := 8;
    ELSIF v_lead.estimated_daily_orders >= 1 THEN v_orders_score := 4;
    END IF;

    -- Contact completeness (0-10 pts)
    IF v_lead.management_name IS NOT NULL THEN v_contact_score := v_contact_score + 3; END IF;
    IF jsonb_array_length(v_lead.phone_numbers) > 0 THEN v_contact_score := v_contact_score + 4; END IF;
    IF v_lead.page_phone IS NOT NULL THEN v_contact_score := v_contact_score + 3; END IF;

    -- Platform fit (0-10 pts)
    IF v_lead.platform IN ('instagram', 'tiktok') THEN v_platform_score := 10;
    ELSIF v_lead.platform IN ('facebook', 'snapchat') THEN v_platform_score := 7;
    ELSIF v_lead.platform IN ('youtube', 'website') THEN v_platform_score := 5;
    ELSE v_platform_score := 3;
    END IF;

    -- Responsiveness (0-15 pts)
    IF v_lead.last_contacted_at IS NOT NULL THEN
        IF v_lead.last_contacted_at > now() - interval '3 days' THEN v_responsiveness_score := 15;
        ELSIF v_lead.last_contacted_at > now() - interval '7 days' THEN v_responsiveness_score := 10;
        ELSIF v_lead.last_contacted_at > now() - interval '30 days' THEN v_responsiveness_score := 5;
        END IF;
    END IF;

    -- Store built bonus (10 pts)
    IF v_lead.prospect_tenant_id IS NOT NULL THEN v_store_score := 10; END IF;

    v_score := v_followers_score + v_engagement_score + v_orders_score +
               v_contact_score + v_platform_score + v_responsiveness_score + v_store_score;
    v_score := LEAST(v_score, 100);

    v_breakdown := jsonb_build_object(
        'followers', v_followers_score,
        'engagement', v_engagement_score,
        'orders', v_orders_score,
        'contact', v_contact_score,
        'platform', v_platform_score,
        'responsiveness', v_responsiveness_score,
        'store', v_store_score
    );

    UPDATE public.leads
    SET lead_score = v_score,
        score_breakdown = v_breakdown,
        updated_at = now()
    WHERE id = p_lead_id;

    RETURN v_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ────────────────────────────────────────────────
-- 16. TRIGGER: Auto-compute tier + predictions on insert/update
-- ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.leads_before_upsert()
RETURNS TRIGGER AS $$
DECLARE
    v_predictions RECORD;
BEGIN
    -- Compute tier from follower count
    NEW.tier := public.compute_lead_tier(NEW.follower_count);

    -- Compute predictions from avg view count
    SELECT * INTO v_predictions
    FROM public.compute_lead_predictions(NEW.avg_view_count, NEW.industry_id);

    NEW.estimated_daily_orders := v_predictions.daily_orders;
    NEW.estimated_monthly_revenue := v_predictions.monthly_revenue;

    -- Normalize phone for dedup
    IF NEW.phone_numbers IS NOT NULL AND jsonb_array_length(NEW.phone_numbers) > 0 THEN
        NEW.normalized_phone := public.normalize_phone((NEW.phone_numbers->0->>'number')::TEXT);
    END IF;

    -- Normalize name for dedup
    NEW.normalized_name := lower(regexp_replace(
        COALESCE(NEW.merchant_name, ''),
        '\s+', '', 'g'
    ));

    NEW.updated_at := now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leads_before_upsert
    BEFORE INSERT OR UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.leads_before_upsert();

-- ────────────────────────────────────────────────
-- 17. TRIGGER: Recalculate lead score after insert/update
-- ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.leads_after_upsert()
RETURNS TRIGGER AS $$
BEGIN
    IF pg_trigger_depth() < 2 THEN
        PERFORM public.calculate_lead_score(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_leads_after_upsert
    AFTER INSERT OR UPDATE ON public.leads
    FOR EACH ROW
    EXECUTE FUNCTION public.leads_after_upsert();

-- ────────────────────────────────────────────────
-- 18. RLS POLICIES (admin-only, service role bypass)
-- ────────────────────────────────────────────────

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.leads FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE public.industries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.industries FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE public.lead_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.lead_activities FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE public.lead_follow_ups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.lead_follow_ups FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE public.lead_social_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.lead_social_links FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE public.lead_competitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.lead_competitors FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE public.whatsapp_outreach_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.whatsapp_outreach_templates FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE public.admin_employee_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.admin_employee_tracking FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE public.admin_commission_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.admin_commission_config FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE public.admin_employee_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.admin_employee_commissions FOR ALL USING (false) WITH CHECK (false);

ALTER TABLE public.admin_employee_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.admin_employee_achievements FOR ALL USING (false) WITH CHECK (false);
