-- Fix activity_logs table to allow nullable user_id
-- This prevents blocking if session isn't available during logging

-- Make user_id nullable
ALTER TABLE public.activity_logs 
  ALTER COLUMN user_id DROP NOT NULL;

-- Update RLS policy to allow inserts from any authenticated user
DROP POLICY IF EXISTS "Users can create activity logs" ON public.activity_logs;
CREATE POLICY "Authenticated users can create activity logs"
  ON public.activity_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Allow users to view their own logs (including null user_id if somehow created)
DROP POLICY IF EXISTS "Users can view own activity logs" ON public.activity_logs;
CREATE POLICY "Users can view own activity logs"
  ON public.activity_logs FOR SELECT
  USING (auth.uid() = user_id OR user_id IS NULL);
