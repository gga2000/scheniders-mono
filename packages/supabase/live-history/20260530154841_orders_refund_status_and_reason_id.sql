DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_status') THEN
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

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS rejection_reason_id UUID REFERENCES public.rejection_reasons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_rejection_reason_id
    ON public.orders(rejection_reason_id)
    WHERE rejection_reason_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';;
