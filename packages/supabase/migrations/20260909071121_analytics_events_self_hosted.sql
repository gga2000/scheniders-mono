-- OBS-D1 (business-event half) — the product could not answer basic questions:
-- how often is the dashboard opened, is the date filter ever used, how often does
-- the metrics query fail for real merchants, which numbers get clicked through.
--
-- No analytics sink exists in this repo, and picking a vendor is a product decision
-- with cost, DPA and customer-PII implications — in this market especially. A
-- self-hosted table needs no procurement and keeps the data inside the system that
-- already holds it. Events carry tenant_id, user_id and non-PII properties only.
--
-- Verified after apply: a member CAN insert their own event; forging another user's
-- id fails 42501; SELECT is admin-only (so the client must never chain `.select()`
-- onto the insert — that turns an allowed write into a 42501 for employees).
--
-- DOWN MIGRATION: DROP TABLE public.analytics_events;

CREATE TABLE IF NOT EXISTS public.analytics_events (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    event       text NOT NULL CHECK (char_length(event) BETWEEN 1 AND 64),
    props       jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.analytics_events IS
    'Self-hosted product analytics (OBS-D1). NEVER put customer PII or money figures '
    'in `props` — events are for product usage, not business records. Written by the '
    'client through RLS; read by tenant admins.';

CREATE INDEX IF NOT EXISTS idx_analytics_events_tenant_time
    ON public.analytics_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event_time
    ON public.analytics_events (event, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS analytics_events_insert_own ON public.analytics_events;
CREATE POLICY analytics_events_insert_own ON public.analytics_events
    FOR INSERT TO authenticated
    WITH CHECK (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND (user_id IS NULL OR user_id = auth.uid())
    );

DROP POLICY IF EXISTS analytics_events_select_admin ON public.analytics_events;
CREATE POLICY analytics_events_select_admin ON public.analytics_events
    FOR SELECT TO authenticated
    USING (
        tenant_id IN (SELECT public.get_user_tenant_ids())
        AND public.is_tenant_admin(tenant_id)
    );

-- No UPDATE/DELETE policy: append-only for clients. Retention jobs use service-role.
REVOKE ALL ON public.analytics_events FROM anon;
GRANT SELECT, INSERT ON public.analytics_events TO authenticated;
