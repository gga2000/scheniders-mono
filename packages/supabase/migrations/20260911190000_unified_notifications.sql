-- Wave 2a — E1/E2/E4 + A3 + B4: one notifications table.
--
-- Today there are two systems: order_notifications (tenant-wide, watermark
-- clearing, read state in a side table) and chat_notifications (per-recipient,
-- row deletes, its own is_read column). They are merged only visually, inside
-- one dropdown, and every new notification category would have to pick one shape
-- and reimplement the other half.
--
-- This is the single event table both collapse into. Two audience modes cover
-- both existing behaviours without fanning out a row per recipient (23 members ×
-- 12k notifications would be 280k rows):
--   audience='tenant'  — everyone in the tenant sees it (order activity)
--   audience='user'    — only recipient_id sees it (mentions, and anything
--                        addressed to one person later)
--
-- E2: the human sentence is NOT stored. `type` + `payload` + `entity_label` are
-- structured, and the client renders them in the viewer's language. The old
-- `message` column was English prose written by a trigger, which is why the feed
-- read English inside an Arabic UI.

CREATE TABLE IF NOT EXISTS public.notifications (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,

    -- 'order.created', 'order.status_changed', 'chat.mention', 'inventory.low'…
    type          TEXT NOT NULL,
    -- Coarser bucket the preference matrix switches on: orders, chat,
    -- inventory, delivery, finance, customer, team, system.
    category      TEXT NOT NULL,

    audience      TEXT NOT NULL CHECK (audience IN ('tenant', 'user')),
    recipient_id  UUID REFERENCES auth.users(id) ON DELETE CASCADE,

    actor_name    TEXT,
    actor_avatar  TEXT,

    entity_type   TEXT,
    entity_id     UUID,
    -- What the reader recognises it by: '#7388'. Kept denormalised so the feed
    -- never has to join the entity to render a row.
    entity_label  TEXT,

    payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
    priority      TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    -- Coalescing key for grouping (B6) and storm suppression (A6).
    group_key     TEXT,

    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT notifications_recipient_required
        CHECK (audience <> 'user' OR recipient_id IS NOT NULL)
);

-- The feed is always "this tenant, newest first". A3: with the watermark read
-- once instead of joined per row, this index can actually drive the ORDER BY.
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created
    ON public.notifications (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient
    ON public.notifications (recipient_id, created_at DESC)
    WHERE recipient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_entity
    ON public.notifications (entity_type, entity_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Reads go through a SECURITY DEFINER RPC, but realtime postgres_changes
-- evaluates RLS per subscriber, so this policy is what keeps live events
-- tenant-scoped and recipient-scoped.
DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select
    ON public.notifications FOR SELECT
    USING (
        tenant_id IN (SELECT get_user_tenant_ids())
        AND (audience = 'tenant' OR recipient_id = auth.uid())
    );

REVOKE ALL ON public.notifications FROM anon;
REVOKE ALL ON public.notifications FROM authenticated;
GRANT SELECT ON public.notifications TO authenticated;

-- ---------------------------------------------------------------------------
-- Per-user state (unchanged model, now shared by every category)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_user_state (
    notification_id UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    read_at         TIMESTAMPTZ,
    dismissed_at    TIMESTAMPTZ,
    PRIMARY KEY (notification_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_notification_user_state_user
    ON public.notification_user_state (user_id);

ALTER TABLE public.notification_user_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_user_state_rw ON public.notification_user_state;
CREATE POLICY notification_user_state_rw
    ON public.notification_user_state FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.notification_user_state FROM anon;
REVOKE ALL ON public.notification_user_state FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_user_state TO authenticated;

CREATE TABLE IF NOT EXISTS public.notification_feed_state (
    user_id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    cleared_before TIMESTAMPTZ,
    read_before    TIMESTAMPTZ
);

ALTER TABLE public.notification_feed_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_feed_state_rw ON public.notification_feed_state;
CREATE POLICY notification_feed_state_rw
    ON public.notification_feed_state FOR ALL
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

REVOKE ALL ON public.notification_feed_state FROM anon;
REVOKE ALL ON public.notification_feed_state FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_feed_state TO authenticated;
