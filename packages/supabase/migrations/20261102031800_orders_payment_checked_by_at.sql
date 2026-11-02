-- Reviewed ✓ now means "payment checked" (Ali, 2026-11-02): a staff member ticks a
-- delivered or completed order once the courier's money for it is matched.
-- `is_reviewed` stays as the flag; these two columns record who ticked it and
-- when. Only the server writes them: the trigger fills them from the session
-- whenever the flag changes and keeps the stored values otherwise, so a browser
-- cannot forge or clear them. Orders' tenant RLS covers both columns.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES public.user_profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.orders_stamp_payment_checked()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.is_reviewed, false) THEN
      NEW.reviewed_at := now();
      NEW.reviewed_by := auth.uid();
    ELSE
      NEW.reviewed_at := NULL;
      NEW.reviewed_by := NULL;
    END IF;
  ELSIF NEW.is_reviewed IS DISTINCT FROM OLD.is_reviewed THEN
    NEW.reviewed_at := CASE WHEN NEW.is_reviewed THEN now() END;
    NEW.reviewed_by := CASE WHEN NEW.is_reviewed THEN auth.uid() END;
  ELSE
    NEW.reviewed_at := OLD.reviewed_at;
    NEW.reviewed_by := OLD.reviewed_by;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_stamp_payment_checked ON public.orders;
CREATE TRIGGER trg_orders_stamp_payment_checked
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_stamp_payment_checked();

-- The "Payment not checked" filter reads delivered/completed orders without the tick.
CREATE INDEX IF NOT EXISTS orders_payment_unchecked_idx
  ON public.orders (tenant_id, status)
  WHERE NOT coalesce(is_reviewed, false) AND deleted_at IS NULL;
