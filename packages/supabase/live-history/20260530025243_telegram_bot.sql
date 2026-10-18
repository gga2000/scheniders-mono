-- =============================================
-- TELEGRAM BOT (tenant-scoped)
-- =============================================

-- ─── telegram_link_codes ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.telegram_link_codes (
    code              TEXT PRIMARY KEY,
    tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_profile_id   UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    created_by        UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at        TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
    used_at           TIMESTAMPTZ,
    used_by_tg_id     BIGINT
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_tenant
    ON public.telegram_link_codes(tenant_id);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_user_profile
    ON public.telegram_link_codes(user_profile_id);

CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_active
    ON public.telegram_link_codes(tenant_id, expires_at)
    WHERE used_at IS NULL;

-- ─── telegram_employee_link ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.telegram_employee_link (
    telegram_user_id   BIGINT PRIMARY KEY,
    tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    user_profile_id    UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    telegram_username  TEXT,
    linked_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_employee_link_tenant
    ON public.telegram_employee_link(tenant_id);

CREATE INDEX IF NOT EXISTS idx_telegram_employee_link_user_profile
    ON public.telegram_employee_link(user_profile_id);

-- ─── telegram_pending_orders ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.telegram_pending_orders (
    id                   BIGSERIAL PRIMARY KEY,
    tenant_id            UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    telegram_user_id     BIGINT NOT NULL,
    chat_id              BIGINT NOT NULL,
    message_id           BIGINT NOT NULL,
    user_profile_id      UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
    extracted            JSONB NOT NULL,
    state                TEXT NOT NULL DEFAULT 'awaiting_product'
                              CHECK (state IN ('awaiting_product', 'cancelled', 'completed')),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at         TIMESTAMPTZ,
    confirmed_order_id   UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    cancelled_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_telegram_pending_tenant
    ON public.telegram_pending_orders(tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_telegram_pending_chat_msg
    ON public.telegram_pending_orders(chat_id, message_id);

CREATE INDEX IF NOT EXISTS idx_telegram_pending_active
    ON public.telegram_pending_orders(telegram_user_id)
    WHERE state = 'awaiting_product';

-- =============================================
-- ROW LEVEL SECURITY
-- The bot uses the service role (bypasses RLS). These policies cover
-- dashboard reads/writes by tenant admins for their own tenant only.
-- =============================================

ALTER TABLE public.telegram_link_codes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_employee_link   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telegram_pending_orders  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "telegram_link_codes_tenant_admin_all"
    ON public.telegram_link_codes
    FOR ALL
    USING (
        tenant_id = public.get_current_tenant_id()
        AND public.is_tenant_admin(tenant_id)
    )
    WITH CHECK (
        tenant_id = public.get_current_tenant_id()
        AND public.is_tenant_admin(tenant_id)
    );

CREATE POLICY "telegram_employee_link_tenant_admin_read"
    ON public.telegram_employee_link
    FOR SELECT
    USING (
        tenant_id = public.get_current_tenant_id()
        AND (public.is_tenant_admin(tenant_id) OR user_profile_id = auth.uid())
    );

CREATE POLICY "telegram_employee_link_tenant_admin_delete"
    ON public.telegram_employee_link
    FOR DELETE
    USING (
        tenant_id = public.get_current_tenant_id()
        AND public.is_tenant_admin(tenant_id)
    );

CREATE POLICY "telegram_pending_orders_tenant_admin_read"
    ON public.telegram_pending_orders
    FOR SELECT
    USING (
        tenant_id = public.get_current_tenant_id()
        AND public.is_tenant_admin(tenant_id)
    );;
