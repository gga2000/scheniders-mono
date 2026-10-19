-- Email allowlist for inviting employees (incl. via Google).
-- A pending row authorizes an email; on that email's first sign-in the auth
-- callback auto-provisions a user_profiles row + active tenant_members row.
CREATE TABLE public.team_invites (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id        uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    email            text NOT NULL,
    role             text NOT NULL DEFAULT 'employee',
    display_name     text,
    status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
    invited_by       uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    accepted_user_id uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    accepted_at      timestamptz
);

-- At most one PENDING invite per (tenant, email); fast email lookup for the callback.
CREATE UNIQUE INDEX team_invites_tenant_email_pending_uidx
    ON public.team_invites (tenant_id, lower(email)) WHERE status = 'pending';
CREATE INDEX team_invites_email_pending_idx
    ON public.team_invites (lower(email)) WHERE status = 'pending';
CREATE INDEX team_invites_tenant_idx ON public.team_invites (tenant_id);

ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY;

-- Tenant members can READ their tenant's invites (for the Team-page UI).
-- WRITES go only through the admin server endpoint (service role) + the auth
-- callback (service role); no client INSERT/UPDATE/DELETE policy is granted.
CREATE POLICY team_invites_tenant_read ON public.team_invites
    FOR SELECT USING (tenant_id IN (SELECT get_user_tenant_ids()));;
