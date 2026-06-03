-- Global queue of blocked sign-ins (authenticated but unprovisioned, e.g. a
-- Google sign-in with no invite). A super-admin reviews these and approves with
-- a tenant + role, which provisions the user.
CREATE TABLE public.access_requests (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email       text NOT NULL,
    name        text,
    status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
    reviewed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX access_requests_user_uidx ON public.access_requests (user_id);
CREATE INDEX access_requests_pending_idx ON public.access_requests (created_at DESC) WHERE status = 'pending';

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- Only super-admins can read the queue (client-side list). Writes go through the
-- service-role callback (record) + approve/reject endpoints.
CREATE POLICY access_requests_superadmin_read ON public.access_requests
    FOR SELECT USING (
        EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
    );
