-- Migration: Add internal_notes column to orders table
-- This separates internal employee notes from customer-visible order notes

ALTER TABLE orders ADD COLUMN IF NOT EXISTS internal_notes TEXT;

COMMENT ON COLUMN orders.internal_notes IS 'Internal notes between employees, not shown on invoice';
COMMENT ON COLUMN orders.notes IS 'Order notes visible to customer, shown on invoice';
