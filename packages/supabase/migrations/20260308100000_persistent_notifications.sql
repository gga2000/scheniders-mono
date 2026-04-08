-- Migration: Create Persistent Order Notifications
-- Description: Creates a table to store order activity notifications persistently in the database.

-- 1. Create the order_notifications table
CREATE TABLE IF NOT EXISTS public.order_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    order_display_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('order_created', 'status_change', 'order_updated')),
    user_name TEXT NOT NULL,
    user_avatar TEXT,
    message TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_order_notifications_order_id ON public.order_notifications(order_id);
CREATE INDEX IF NOT EXISTS idx_order_notifications_created_at ON public.order_notifications(created_at);

-- 3. RLS for order_notifications
ALTER TABLE public.order_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view all notifications" ON public.order_notifications;
CREATE POLICY "Authenticated users can view all notifications"
    ON public.order_notifications FOR SELECT
    USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Triggers can insert notifications" ON public.order_notifications;
CREATE POLICY "Triggers can insert notifications"
    ON public.order_notifications FOR INSERT
    WITH CHECK (true); -- Triggers run as security definer, so this is safe

-- 4. Create trigger function to automatically log notifications
CREATE OR REPLACE FUNCTION public.log_order_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_order_display_id TEXT;
    v_user_name TEXT;
    v_user_avatar TEXT;
    v_history_id UUID;
    v_event_type TEXT;
    v_message TEXT;
BEGIN
    -- Get order display ID
    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;
    
    v_order_display_id := '#' || NEW.order_id; -- Or whatever format we use

    -- Get actor info from the record (it's denormalized on orders now)
    v_user_name := COALESCE(NEW.last_status_changed_by_name, 'Team Member');
    v_user_avatar := NEW.last_status_changed_by_avatar;

    -- Determine event type and message
    IF (TG_OP = 'INSERT') THEN
        v_event_type := 'order_created';
        v_message := 'New order ' || NEW.order_id || ' created';
        
        INSERT INTO public.order_notifications (
            order_id, order_display_id, type, user_name, user_avatar, message, new_status
        ) VALUES (
            NEW.id, v_order_display_id, v_event_type, v_user_name, v_user_avatar, v_message, NEW.status
        );
    ELSIF (TG_OP = 'UPDATE') THEN
        IF (OLD.status IS DISTINCT FROM NEW.status) THEN
            v_event_type := 'status_change';
            v_message := 'Order ' || NEW.order_id || ' status changed: ' || OLD.status || ' → ' || NEW.status;
            
            INSERT INTO public.order_notifications (
                order_id, order_display_id, type, user_name, user_avatar, message, old_status, new_status
            ) VALUES (
                NEW.id, v_order_display_id, v_event_type, v_user_name, v_user_avatar, v_message, OLD.status, NEW.status
            );
        -- Only log generic update if something significant changed but status did not
        ELSIF (OLD.customer_name IS DISTINCT FROM NEW.customer_name OR 
               OLD.phone IS DISTINCT FROM NEW.phone OR 
               OLD.items::TEXT IS DISTINCT FROM NEW.items::TEXT) THEN
            v_event_type := 'order_updated';
            v_message := 'Order ' || NEW.order_id || ' was updated';
            
            INSERT INTO public.order_notifications (
                order_id, order_display_id, type, user_name, user_avatar, message
            ) VALUES (
                NEW.id, v_order_display_id, v_event_type, v_user_name, v_user_avatar, v_message
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach trigger to orders table
DROP TRIGGER IF EXISTS trigger_log_order_notification ON orders;
CREATE TRIGGER trigger_log_order_notification
AFTER INSERT OR UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION public.log_order_notification();

-- 6. Backfill some recent notifications (optional)
-- We'll skip for now to avoid duplicate noise, starting fresh with database-level logging.
