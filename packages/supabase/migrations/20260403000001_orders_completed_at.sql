-- Add completed_at column to track exactly when an order was marked completed
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Backfill: for existing completed orders, use updated_at as best approximation
UPDATE public.orders SET completed_at = updated_at WHERE status = 'completed' AND completed_at IS NULL;

-- Trigger: keep completed_at accurate on future status changes
CREATE OR REPLACE FUNCTION public.set_order_completed_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed' THEN
        NEW.completed_at = NOW();
    ELSIF NEW.status != 'completed' THEN
        NEW.completed_at = NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_order_completed_at ON public.orders;
CREATE TRIGGER trg_order_completed_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.set_order_completed_at();
