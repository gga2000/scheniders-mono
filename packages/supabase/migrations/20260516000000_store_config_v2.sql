-- =====================================================================
-- Store Config v2 — Schneiders Builder
-- =====================================================================
-- Adds the v2 column and history tables alongside the legacy
-- `store_config` jsonb column. Existing tenants keep their legacy config
-- until the migration script writes a v2 snapshot. The storefront reads
-- v2 first and falls back to legacy.
-- =====================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS store_config_v2 jsonb,
  ADD COLUMN IF NOT EXISTS store_config_v2_draft jsonb,
  ADD COLUMN IF NOT EXISTS config_version smallint NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.tenants.store_config_v2 IS
  'Published v2 builder config — pages, sections with variants, brand kit, etc.';

COMMENT ON COLUMN public.tenants.store_config_v2_draft IS
  'Unpublished v2 builder draft. Promoted to store_config_v2 on Publish.';

COMMENT ON COLUMN public.tenants.config_version IS
  '1 = legacy store_config, 2 = store_config_v2. Determines which the storefront reads.';

CREATE INDEX IF NOT EXISTS idx_tenants_config_version
  ON public.tenants (config_version);

-- ---------------------------------------------------------------------
-- Version history — named snapshots
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.store_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  label text,
  is_named boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL,
  /* Optional structured diff vs. previous version. */
  diff_summary jsonb,
  created_by uuid REFERENCES auth.users (id),
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.store_config_versions IS
  'Append-only history of store_config_v2 changes. Named snapshots survive pruning.';

CREATE INDEX IF NOT EXISTS idx_store_config_versions_tenant_created
  ON public.store_config_versions (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_store_config_versions_named
  ON public.store_config_versions (tenant_id, created_at DESC)
  WHERE is_named = true;

ALTER TABLE public.store_config_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can read their own version history"
  ON public.store_config_versions
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant members can insert versions"
  ON public.store_config_versions
  FOR INSERT
  WITH CHECK (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Scheduled changes — top-level index of future-dated variants
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.store_config_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  label text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  timezone text NOT NULL DEFAULT 'Asia/Baghdad',
  /* JSON array of { page_id, section_id, variant_id }. */
  targets jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'active', 'expired', 'cancelled')),
  created_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_config_schedules_tenant_active
  ON public.store_config_schedules (tenant_id, starts_at)
  WHERE status IN ('scheduled', 'active');

ALTER TABLE public.store_config_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can manage their schedules"
  ON public.store_config_schedules
  FOR ALL
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- A/B experiment dashboards — aggregated counters
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.store_config_experiment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  experiment_id text NOT NULL,
  arm_id text NOT NULL,
  visitor_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('view', 'add_to_cart', 'checkout_start', 'order', 'click')),
  /* IQD revenue if event_type='order'. */
  revenue_iqd integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exp_events_tenant_exp_created
  ON public.store_config_experiment_events (tenant_id, experiment_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_exp_events_arm_event_type
  ON public.store_config_experiment_events (tenant_id, experiment_id, arm_id, event_type);

ALTER TABLE public.store_config_experiment_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read their experiment events"
  ON public.store_config_experiment_events
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- Edge functions / server actions write events with service role; no INSERT policy needed.

-- ---------------------------------------------------------------------
-- Performance audits (#13) — captured by Playwright worker
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.store_performance_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  page_id text NOT NULL,
  breakpoint text NOT NULL CHECK (breakpoint IN ('mobile', 'tablet', 'desktop')),
  network_profile text NOT NULL DEFAULT 'slow-3g',
  /* Core Web Vitals + custom marks. */
  lcp_ms integer,
  fid_ms integer,
  cls numeric,
  tti_ms integer,
  total_bytes integer,
  image_bytes integer,
  font_bytes integer,
  js_bytes integer,
  score_perf smallint,
  score_a11y smallint,
  score_seo smallint,
  score_best_practices smallint,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_audits_tenant_page_created
  ON public.store_performance_audits (tenant_id, page_id, created_at DESC);

ALTER TABLE public.store_performance_audits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read their performance audits"
  ON public.store_performance_audits
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- Visual regression snapshots (#15)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.store_visual_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants (id) ON DELETE CASCADE,
  page_id text NOT NULL,
  breakpoint text NOT NULL CHECK (breakpoint IN ('mobile', 'tablet', 'desktop')),
  /* Stored in supabase storage; column holds the bucket path. */
  screenshot_path text NOT NULL,
  config_version_id uuid REFERENCES public.store_config_versions (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, page_id, breakpoint, config_version_id)
);

CREATE INDEX IF NOT EXISTS idx_visual_baselines_tenant_page
  ON public.store_visual_baselines (tenant_id, page_id, breakpoint);

ALTER TABLE public.store_visual_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can read their visual baselines"
  ON public.store_visual_baselines
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id
      FROM public.tenant_members
      WHERE user_id = auth.uid()
    )
  );
