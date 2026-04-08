-- Migration: Add refund status values to orders status constraint
-- Run this in Supabase SQL Editor

-- Update the status constraint to include refund statuses
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
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
        'pending_checkout'
    )
);

-- Add comment for documentation
COMMENT ON COLUMN orders.status IS 'Order status: new, contacted, confirmed, cancelled, in_transit, delivered, rejected, completed, no_response, return_pending, refund_delivered, refund_failed, pending_checkout';
