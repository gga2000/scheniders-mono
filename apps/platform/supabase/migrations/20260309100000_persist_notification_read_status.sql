-- Migration: Persist Notification Read Status
-- Description: Adds is_read column and updates RLS for order_notifications.

-- 1. Add is_read column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='order_notifications' AND column_name='is_read') THEN
        ALTER TABLE public.order_notifications ADD COLUMN is_read BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 2. Update RLS policies
-- Drop the wide "Enable all access" policy and replace with specific ones if needed, 
-- or just ensure it covers UPDATE.

DROP POLICY IF EXISTS "Enable all access for notifications" ON public.order_notifications;
DROP POLICY IF EXISTS "Authenticated users can view all notifications" ON public.order_notifications;

-- Allow reading for everyone (consistent with existing orders access in this dev env)
CREATE POLICY "Enable read access for all" 
    ON public.order_notifications FOR SELECT 
    TO anon, authenticated
    USING (true);

-- Allow inserting from triggers (security definer function will handle it, but being explicit)
CREATE POLICY "Enable insert for all" 
    ON public.order_notifications FOR INSERT 
    TO anon, authenticated
    WITH CHECK (true);

-- Allow updating read status
CREATE POLICY "Enable update for read status" 
    ON public.order_notifications FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);
