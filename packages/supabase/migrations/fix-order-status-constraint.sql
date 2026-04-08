-- =============================================
-- Fix Order Status CHECK Constraint
-- Run this in Supabase SQL Editor to add missing status values
-- =============================================

-- The current constraint only allows: 'new', 'contacted', 'confirmed', 'rejected', 'delivered'
-- We need to add: 'cancelled', 'in_transit', 'completed', 'no_response', 'return_pending', 'pending_checkout'

-- Step 1: Drop the existing CHECK constraint
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;

-- Step 2: Add the new CHECK constraint with all status values
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN (
    'new',           -- Just received
    'contacted',     -- Employee reached out to customer  
    'confirmed',     -- Customer confirmed the order
    'cancelled',     -- Customer cancelled the order
    'in_transit',    -- Order shipped to delivery company
    'delivered',     -- Delivery confirmed by delivery person
    'rejected',      -- Delivery rejected at the door
    'completed',     -- Delivery verified and finalized
    'no_response',   -- Customer never responded to contact attempts
    'return_pending', -- Return order awaiting processing
    'pending_checkout' -- Checkout initiated but not completed
  ));

-- Verify the constraint was added
SELECT constraint_name, check_clause 
FROM information_schema.check_constraints 
WHERE constraint_name = 'orders_status_check';
