-- Fix RLS policy for order_notifications to allow visibility
-- Current policy requires auth.uid() is not null, which blocks anon access.

DROP POLICY IF EXISTS "Authenticated users can view all notifications" ON public.order_notifications;
DROP POLICY IF EXISTS "Everyone can view notifications" ON public.order_notifications;

-- Align with orders table access (allowing everyone to view in dev/anon context)
CREATE POLICY "Enable all access for notifications" 
    ON public.order_notifications FOR SELECT 
    TO anon, authenticated
    USING (true);
