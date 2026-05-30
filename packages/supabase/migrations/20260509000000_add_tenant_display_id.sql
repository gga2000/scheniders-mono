-- Adds a stable, human-friendly numeric ID to every tenant.
--
-- Why: support staff and merchants need a short code to reference a tenant in
-- conversations. UUIDs are too long; a hash of the UUID has unbounded collision
-- risk. A sequence-backed integer is collision-free and indexable.
--
-- Display rule: zero-pad to 6 digits (e.g. `#000042`, `#100001`). Codes start
-- at 100000 so every merchant has a 6-digit number from day one.

BEGIN;

-- 1) Sequence shared by all tenants. Starts at 100000 so existing rows + new
--    rows all get a 6-digit code.
CREATE SEQUENCE IF NOT EXISTS tenant_display_id_seq
  AS BIGINT
  START WITH 100000
  INCREMENT BY 1
  MINVALUE 100000
  NO CYCLE;

-- 2) Column. Nullable during backfill, made NOT NULL at the end.
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS display_id BIGINT;

-- 3) Backfill existing rows in creation order so older merchants get lower
--    numbers. Uses a deterministic order to keep this idempotent.
WITH ranked AS (
  SELECT
    id,
    100000 + (ROW_NUMBER() OVER (ORDER BY created_at, id)) - 1 AS new_display_id
  FROM tenants
  WHERE display_id IS NULL
)
UPDATE tenants t
SET display_id = ranked.new_display_id
FROM ranked
WHERE t.id = ranked.id;

-- 4) Advance the sequence past the highest backfilled value so future inserts
--    don't collide.
SELECT setval(
  'tenant_display_id_seq',
  GREATEST(100000, COALESCE((SELECT MAX(display_id) FROM tenants), 99999)),
  true
);

-- 5) Lock the column down: NOT NULL, UNIQUE, default from the sequence.
ALTER TABLE tenants
  ALTER COLUMN display_id SET DEFAULT nextval('tenant_display_id_seq'),
  ALTER COLUMN display_id SET NOT NULL;

-- Sequence is owned by the column so dropping the column drops the sequence.
ALTER SEQUENCE tenant_display_id_seq OWNED BY tenants.display_id;

CREATE UNIQUE INDEX IF NOT EXISTS tenants_display_id_idx
  ON tenants (display_id);

COMMIT;
