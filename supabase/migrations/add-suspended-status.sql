-- Migration to add 'suspended' to order status constraint
-- 1. Drop the existing constraint
ALTER TABLE orders DROP CONSTRAINT orders_status_check;

-- 2. Add the new constraint with 'suspended'
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
    'pending_checkout',
    'suspended'
  )
);
