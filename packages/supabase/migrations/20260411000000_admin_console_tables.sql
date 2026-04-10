-- Admin Console Tables
-- These tables are used exclusively by the admin console (apps/admin)
-- All access is via service role (bypasses RLS)

-- Admin notes for internal use
CREATE TABLE public.admin_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    admin_user_id UUID NOT NULL REFERENCES public.user_profiles(id),
    content TEXT NOT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_notes_tenant_id ON public.admin_notes(tenant_id);

-- Admin activity audit log
CREATE TABLE public.admin_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES public.user_profiles(id),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_activity_logs_admin ON public.admin_activity_logs(admin_user_id, created_at DESC);
CREATE INDEX idx_admin_activity_logs_tenant ON public.admin_activity_logs(tenant_id, created_at DESC);
CREATE INDEX idx_admin_activity_logs_action ON public.admin_activity_logs(action);

-- Admin console settings (key-value store)
CREATE TABLE public.admin_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}',
    updated_by UUID REFERENCES public.user_profiles(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: block anon/authenticated, service role bypasses automatically
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.admin_notes FOR ALL USING (false);

ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.admin_activity_logs FOR ALL USING (false);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role only" ON public.admin_settings FOR ALL USING (false);
