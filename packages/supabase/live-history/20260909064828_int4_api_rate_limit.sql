-- INT-4: the Gemini image-analysis route had no rate limit, so any authenticated
-- user could drive unbounded spend against the Gemini account.
--
-- This was previously left open on the grounds that the app has no shared store
-- (no Redis, only @upstash/qstash) and a per-instance counter on serverless would
-- be a guard in name only. That reasoning missed the obvious: Postgres IS the
-- shared store. A single atomic upsert gives a correct fixed-window limiter
-- across every instance, with no new infrastructure to provision.

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  bucket_key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0
);

-- Lets a cleanup job find stale buckets cheaply.
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window_start
  ON public.api_rate_limits (window_start);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- No policies: this table is only ever touched by the SECURITY DEFINER function
-- below, called from server routes under the service role. A client that could
-- read or reset its own bucket could trivially defeat the limit.

/**
 * Consume one unit from a fixed window, atomically.
 *
 * Returns whether the call is allowed, how many remain, and when the window
 * resets. The whole decision is one INSERT ... ON CONFLICT, so concurrent
 * requests on different instances cannot both read a stale count.
 */
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  _key text,
  _limit integer,
  _window_seconds integer
)
RETURNS TABLE (allowed boolean, remaining integer, reset_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _count integer;
  _start timestamptz;
BEGIN
  INSERT INTO api_rate_limits AS l (bucket_key, window_start, request_count)
  VALUES (_key, now(), 1)
  ON CONFLICT (bucket_key) DO UPDATE
    SET request_count = CASE
          WHEN l.window_start < now() - make_interval(secs => _window_seconds) THEN 1
          ELSE l.request_count + 1
        END,
        window_start = CASE
          WHEN l.window_start < now() - make_interval(secs => _window_seconds) THEN now()
          ELSE l.window_start
        END
  RETURNING l.request_count, l.window_start INTO _count, _start;

  RETURN QUERY SELECT
    _count <= _limit,
    GREATEST(_limit - _count, 0),
    _start + make_interval(secs => _window_seconds);
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.consume_rate_limit(text, integer, integer) IS
  'Atomic fixed-window rate limiter backed by Postgres. Server-side only. See INT-4.';;
