-- Audit table to log all order deletions for recovery purposes
CREATE TABLE IF NOT EXISTS deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deleted_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  order_count INTEGER NOT NULL,
  order_ids TEXT[] NOT NULL,
  order_snapshots JSONB NOT NULL
);

-- Index for quick lookup by date
CREATE INDEX idx_deletion_log_deleted_at ON deletion_log(deleted_at DESC);
