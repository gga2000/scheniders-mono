-- Prime courier API link.
--
-- Scheniders is one "integrated system" at Prime (one system code, password
-- and initial token, held in server env). Each tenant that ships with Prime
-- through the API is one Prime merchant + shop under that system:
--
-- prime_connections: one row per tenant: the Prime merchant login id and the
-- shop id (Prime's `senderId`). Written by the platform operator only; no
-- browser role can read or write it (service role: server routes + cron).
--
-- prime_shipments: one row per order handed to Prime through the API: the
-- receipt number we sent, Prime's case id, and the last status the sync saw.
-- Kept off `orders` on purpose: writing an order bumps its `version`, and the
-- dispatch desk moves the same orders to in_transit right after sending them,
-- pinned to the versions it read. Tenant members can read their own rows;
-- only the service role writes.

CREATE TABLE IF NOT EXISTS public.prime_connections (
    tenant_id          UUID PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
    merchant_login_id  TEXT NOT NULL CHECK (length(btrim(merchant_login_id)) > 0),
    shop_id            INTEGER NOT NULL CHECK (shop_id > 0),
    is_active          BOOLEAN NOT NULL DEFAULT true,
    last_synced_at     TIMESTAMPTZ,
    last_error         TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.prime_connections ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: deny all to anon/authenticated. Service role bypasses RLS.
REVOKE ALL ON public.prime_connections FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS public.prime_shipments (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    order_id           UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    receipt_no         TEXT NOT NULL CHECK (length(receipt_no) > 0),
    case_id            BIGINT NOT NULL CHECK (case_id > 0),
    -- Prime's simplified status: ONWAY, DELIVERED, PART_DELIVERED,
    -- DELIVERED_CHANGE_PRICE, POSTPONED, CNCL, FAILED_DELIVER_RETURNED_TO_SENDER.
    shipment_status    TEXT,
    step_code          TEXT,
    step_name          TEXT,
    shipment_charge    INTEGER CHECK (shipment_charge IS NULL OR shipment_charge >= 0),
    sent_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    status_changed_at  TIMESTAMPTZ,
    checked_at         TIMESTAMPTZ,
    CONSTRAINT prime_shipments_order_unique UNIQUE (order_id),
    CONSTRAINT prime_shipments_case_unique UNIQUE (tenant_id, case_id)
);

CREATE INDEX IF NOT EXISTS idx_prime_shipments_tenant_status
    ON public.prime_shipments (tenant_id, shipment_status);

ALTER TABLE public.prime_shipments ENABLE ROW LEVEL SECURITY;

CREATE POLICY prime_shipments_member_read ON public.prime_shipments
    FOR SELECT TO authenticated
    USING (tenant_id IN (SELECT get_user_tenant_ids()));

REVOKE ALL ON public.prime_shipments FROM anon, authenticated;
GRANT SELECT ON public.prime_shipments TO authenticated;
