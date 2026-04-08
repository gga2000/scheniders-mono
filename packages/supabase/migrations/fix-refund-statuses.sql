-- Drop the existing constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Add the new constraint with ALL currently supported frontend statuses
ALTER TABLE orders ADD CONSTRAINT orders_status_check CHECK (
  status IN (
    'new',
    'contacted',
    'confirmed',
    'cancelled',
    'in_transit',
    'delivered',
    'rejected',
    'completed',
    'no_response',
    'return_pending',
    'refund_delivered',
    'refund_failed',
    'pending_checkout',
    'suspended'
  )
);
