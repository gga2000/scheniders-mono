-- =============================================
-- ORDERS: refund_status financial dimension + rejection_reason_id link
--
-- Two additions that were already used by code/types but missing from the
-- schema after the mono cutover:
--
-- 1. refund_status / refunded_at: a financial dimension independent of
--    `status`. An order can be 'completed' (physically delivered) but
--    'refund_pending' or 'refunded' financially. Lets the orders list
--    surface mixed states (e.g. a completed order whose money was sent
--    back), and powers the "مسترجعة" / "قيد الاسترجاع" sub-status tabs.
--
-- 2. rejection_reason_id: FK to rejection_reasons so cancellations link
--    to a managed reason row instead of just a free-text label. Powers
--    reason-frequency analytics; the free-text `rejection_reason` is
--    kept as a snapshot for orders predating the link or carrying a
--    custom reason.
-- =============================================

-- refund_status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type WHERE typname = 'refund_status'
    ) THEN
        CREATE TYPE public.refund_status AS ENUM ('none', 'pending', 'refunded', 'failed');
    END IF;
END$$;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS refund_status public.refund_status NOT NULL DEFAULT 'none';

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_refund_status
    ON public.orders(refund_status)
    WHERE refund_status <> 'none';

-- rejection_reason_id (FK to rejection_reasons)
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS rejection_reason_id UUID REFERENCES public.rejection_reasons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_rejection_reason_id
    ON public.orders(rejection_reason_id)
    WHERE rejection_reason_id IS NOT NULL;

-- View refresh — v_orders_with_risk re-selects *, so it picks up new columns
-- automatically on the next PostgREST schema reload.

NOTIFY pgrst, 'reload schema';
