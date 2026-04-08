-- Checkout queue for delayed import
-- Checkouts are queued when webhook fires, processed 1 minute later
-- This ensures we have complete customer data before importing

CREATE TABLE IF NOT EXISTS checkout_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkout_id TEXT NOT NULL UNIQUE,  -- Lightfunnels checkout ID (ch_xxx)
    process_after TIMESTAMPTZ NOT NULL, -- Don't process before this time
    queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT,
    processed_at TIMESTAMPTZ -- Set when successfully processed
);

-- Index for the cron job query (unprocessed items ready to process)
CREATE INDEX IF NOT EXISTS idx_checkout_queue_pending
    ON checkout_queue (process_after)
    WHERE processed_at IS NULL;
