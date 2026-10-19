-- =============================================
-- Admin notes + audit log tables
-- These were missing in the live DB but expected by app code.
-- Schema is relaxed: admin_user_id is nullable (admin auth not yet wired),
-- and admin_label / actor_email give fallback display.
-- =============================================

-- 1. Admin notes
CREATE TABLE IF NOT EXISTS public.admin_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    admin_user_id UUID,
    admin_label TEXT,
    content TEXT NOT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notes_tenant_id
    ON public.admin_notes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_admin_notes_pinned
    ON public.admin_notes(tenant_id, is_pinned, updated_at DESC);

-- 2. Admin audit log
CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID,
    admin_label TEXT,
    actor_email TEXT,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_admin
    ON public.admin_activity_logs(admin_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_tenant
    ON public.admin_activity_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_action
    ON public.admin_activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_admin_activity_logs_created
    ON public.admin_activity_logs(created_at DESC);

-- 3. RLS — service role only (admin client bypasses RLS).
ALTER TABLE public.admin_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'admin_notes'
          AND policyname = 'admin_notes_service_only'
    ) THEN
        CREATE POLICY admin_notes_service_only
            ON public.admin_notes FOR ALL TO authenticated USING (false);
    END IF;
END$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public' AND tablename = 'admin_activity_logs'
          AND policyname = 'admin_activity_logs_service_only'
    ) THEN
        CREATE POLICY admin_activity_logs_service_only
            ON public.admin_activity_logs FOR ALL TO authenticated USING (false);
    END IF;
END$$;;
