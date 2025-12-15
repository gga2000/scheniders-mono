-- Fix RLS Policies to allow anon access
-- Run this in your Supabase SQL Editor

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow all operations on orders for authenticated users" ON orders;
DROP POLICY IF EXISTS "Allow all operations on blacklist for authenticated users" ON blacklist;

-- Create new policies that allow anon access (for development)
-- Orders table - allow anon users to do everything
CREATE POLICY "Enable all access for anon users on orders"
  ON orders FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Blacklist table - allow anon users to do everything
CREATE POLICY "Enable all access for anon users on blacklist"
  ON blacklist FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Verify RLS is still enabled
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
