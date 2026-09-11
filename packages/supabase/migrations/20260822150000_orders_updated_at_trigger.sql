-- CON-1 / CON-2 — maintain `orders.updated_at` on every UPDATE.
--
-- WHY
-- Nothing ever set `updated_at` on a platform write: the only BEFORE UPDATE
-- triggers on `orders` are `increment_orders_version` and `trg_order_completed_at`,
-- and the app sends only the caller's changed fields. Four mechanisms silently
-- depended on that column moving:
--   1. the realtime batcher's dedup  (incoming event looked "not newer" -> dropped,
--      so one employee's edit never reached another's screen)
--   2. delta sync   (`updated_at > watermark` never matched a platform edit)
--   3. the drift heartbeat (server MAX(updated_at) never advanced)
--   4. optimistic concurrency (guard always matched -> silent lost writes)
-- (4) is now guarded by the `version` column instead; this trigger fixes 1-3 and
-- makes "last modified" honest.
--
-- ORDERING REQUIREMENT — READ BEFORE APPLYING
-- Apply this ONLY together with (or after) the application code that moves the
-- conflict token from `updated_at` to `version`. Applying it while an older build
-- is still live would arm the previously-dormant `.eq("updated_at", ...)` guards
-- against a client-clock timestamp the browser fabricates optimistically, and
-- merchants would see spurious "modified elsewhere" errors on rapid edits.
--
-- DOWN MIGRATION
--   DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
--   DROP FUNCTION IF EXISTS public.set_orders_updated_at();
-- Reverting re-breaks realtime propagation and delta sync.

CREATE OR REPLACE FUNCTION public.set_orders_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.set_orders_updated_at();
