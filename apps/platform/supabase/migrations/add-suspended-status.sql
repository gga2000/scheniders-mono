ALTER TABLE orders DROP CONSTRAINT orders_status_check;

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
