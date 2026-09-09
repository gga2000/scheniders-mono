-- COR-D3/COR-D1 CORRECTION — a defect introduced by the COR-D3 fix itself.
--
-- Migration 20260906141619 (COR-D3) assumed `orders.delivered_at` was
-- `timestamp WITHOUT time zone` holding UTC instants, and wrote
--     delivered_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Baghdad'
-- to "convert" it. Verified against the live catalog: delivered_at is
-- `timestamp WITH time zone`, like every other _at column on orders. For a
-- timestamptz that chain is wrong twice over:
--   1. `AT TIME ZONE 'UTC'` yields a NAIVE UTC wall clock, and
--   2. `AT TIME ZONE 'Asia/Baghdad'` then re-interprets that naive value as
--      Baghdad local, producing a timestamptz shifted -3h;
--   3. comparing that timestamptz against the naive Baghdad timestamps
--      (c_local, v_today_start) forces an implicit cast through the SESSION
--      TimeZone — a further -3h, and a result that depends on connection state.
--
-- MEASURED ON LIVE DATA (all tenants, before/after):
--   * Cycle time: the shift is exactly -6.0000h on EVERY row (min = max).
--     A delivery 1.67h after creation was being recorded as -4.33h.
--   * The `h >= 0` guard then discarded every sub-6h delivery as "impossible":
--     474 rows excluded, where the correct figure is 91. 383 real deliveries
--     were silently dropped from the average.
--   * Average cycle time 128.50h -> 122.81h (n 3,939 -> 4,322).
--   * Realized revenue (COR-D1 uses the same expression via r_local):
--     revenue TODAY 98,000 -> 238,000 IQD — understated by 59%.
--     revenue THIS MONTH 440,750 -> 464,750 IQD.
--     1,924 of 5,227 realized orders (37%) were bucketed to the WRONG DAY.
--
-- The client fallback engine was never wrong: `parseUtcNaiveTimestamp` detects
-- the +00:00 offset PostgREST sends and parses it as-is. Only the SQL diverged,
-- and the dev-only drift check does not compare cycle time or realized revenue,
-- so the two engines disagreed in silence.
--
-- Both occurrences are in get_dashboard_metrics and nowhere else in the schema
-- (verified: it is the only function whose body contains AT TIME ZONE 'UTC').
--
-- DOWN MIGRATION: re-insert `AT TIME ZONE ''UTC''` into both expressions. There
-- is no reason to: it was never correct.
DO $mig$
DECLARE
  src text;
  acl_before text;
  acl_after  text;
  old_ws text := 'COALESCE(o.delivered_at AT TIME ZONE ''UTC'' AT TIME ZONE ''Asia/Baghdad'',
               o.completed_at AT TIME ZONE ''Asia/Baghdad'') AS r_local';
  new_ws text := 'COALESCE(o.delivered_at AT TIME ZONE ''Asia/Baghdad'',
               o.completed_at AT TIME ZONE ''Asia/Baghdad'') AS r_local';
  old_cycle text := '(delivered_at AT TIME ZONE ''UTC'' AT TIME ZONE ''Asia/Baghdad'') - c_local';
  new_cycle text := '(delivered_at AT TIME ZONE ''Asia/Baghdad'') - c_local';
BEGIN
  SELECT proacl::text INTO acl_before FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_dashboard_metrics';

  src := pg_get_functiondef('public.get_dashboard_metrics(text)'::regprocedure);

  IF position(old_ws IN src) = 0 THEN
    IF position(new_ws IN src) > 0 THEN
      RAISE NOTICE 'tz correction: r_local already correct, nothing to do';
    ELSE
      RAISE EXCEPTION 'tz correction aborted: r_local expression not found in either form';
    END IF;
  ELSE
    src := replace(src, old_ws, new_ws);
  END IF;

  IF position(old_cycle IN src) = 0 THEN
    IF position(new_cycle IN src) > 0 THEN
      RAISE NOTICE 'tz correction: cycle_times already correct, nothing to do';
    ELSE
      RAISE EXCEPTION 'tz correction aborted: cycle_times expression not found in either form';
    END IF;
  ELSE
    src := replace(src, old_cycle, new_cycle);
  END IF;

  -- Belt and braces: no AT TIME ZONE 'UTC' may survive in this function.
  IF position('AT TIME ZONE ''UTC''' IN src) > 0 THEN
    RAISE EXCEPTION 'tz correction aborted: an AT TIME ZONE ''''UTC'''' occurrence remains';
  END IF;

  EXECUTE src;

  -- CREATE OR REPLACE preserves the ACL, but this function has regressed to
  -- Supabase default grants three times in this audit. Assert, do not assume.
  SELECT proacl::text INTO acl_after FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'get_dashboard_metrics';
  IF acl_after IS DISTINCT FROM acl_before THEN
    RAISE EXCEPTION 'tz correction aborted: grants changed (% -> %)', acl_before, acl_after;
  END IF;
END
$mig$;
