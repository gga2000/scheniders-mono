-- Add smart batching fields to print_batches table
-- Migration: Add support for intelligent order batching with SKU clustering

ALTER TABLE print_batches
  ADD COLUMN IF NOT EXISTS sequence_order TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pick_list JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS efficiency_score FLOAT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS strategy TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS context_switches INT DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN print_batches.sequence_order IS 'Optimized order IDs sequence for label printing (minimizes SKU switches)';
COMMENT ON COLUMN print_batches.pick_list IS 'Consolidated pick list with SKUs and quantities (PickListItem[])';
COMMENT ON COLUMN print_batches.efficiency_score IS 'Batch efficiency score 0-100 (based on SKU reuse and context switches)';
COMMENT ON COLUMN print_batches.strategy IS 'Batching strategy used: auto, sku-heavy, priority-first, single-item';
COMMENT ON COLUMN print_batches.context_switches IS 'Number of SKU transitions in the optimized sequence';

-- Create index on strategy for filtering
CREATE INDEX IF NOT EXISTS idx_print_batches_strategy ON print_batches(strategy);

-- Create index on efficiency_score for sorting
CREATE INDEX IF NOT EXISTS idx_print_batches_efficiency ON print_batches(efficiency_score DESC);
