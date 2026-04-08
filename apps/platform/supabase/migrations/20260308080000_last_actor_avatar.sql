-- Migration: Add last status actor info to orders
-- Description: Denormalizes the name and avatar of the last person/bot to change an order's status.

-- 1. Add columns to orders table with 'System' default
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS last_status_changed_by_name TEXT DEFAULT 'System',
ADD COLUMN IF NOT EXISTS last_status_changed_by_avatar TEXT;

-- 2. Create function to update orders from history
CREATE OR REPLACE FUNCTION public.update_order_last_actor()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_name TEXT;
    v_actor_avatar TEXT;
BEGIN
    -- Handle the specific cases for actors
    IF (NEW.changed_by = 'whatsapp_bot') THEN
        v_actor_name := 'WhatsApp Bot';
        v_actor_avatar := 'bot'; 
    ELSE
        -- Try to find the user in user_profiles
        SELECT display_name, avatar_url 
        INTO v_actor_name, v_actor_avatar
        FROM user_profiles
        WHERE display_name = NEW.changed_by
           OR email = NEW.changed_by
        LIMIT 1;

        -- Fallback if not found in profiles but changed_by exists
        IF v_actor_name IS NULL AND NEW.changed_by IS NOT NULL THEN
            v_actor_name := NEW.changed_by;
        END IF;
    END IF;

    -- Update the orders table
    IF v_actor_name IS NOT NULL THEN
        UPDATE orders 
        SET 
            last_status_changed_by_name = v_actor_name,
            last_status_changed_by_avatar = v_actor_avatar
        WHERE id = NEW.order_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Create trigger on order_status_history
DROP TRIGGER IF EXISTS trigger_update_order_last_actor ON order_status_history;
CREATE TRIGGER trigger_update_order_last_actor
AFTER INSERT ON order_status_history
FOR EACH ROW EXECUTE FUNCTION public.update_order_last_actor();

-- 4. Recreate the view to include new columns
-- CRITICAL: DROP VIEW first to handle structural changes correctly.
-- Also, use a subquery for risk_data to prevent any chance of duplicate rows if multiple risk records match.
DROP VIEW IF EXISTS v_orders_with_risk;

CREATE VIEW v_orders_with_risk AS
SELECT 
    o.*,
    (
        SELECT jsonb_build_object(
            'level', cr.risk_level,
            'score', cr.score,
            'reasons', cr.reasons,
            'stats', cr.stats,
            'last_updated', cr.last_updated
        )
        FROM customer_risk cr
        WHERE cr.phone = normalize_phone(o.phone)
           OR cr.phone = normalize_phone(o.secondary_phone)
        ORDER BY cr.last_updated DESC
        LIMIT 1
    ) as risk_data
FROM orders o;

-- Keep permissions
GRANT SELECT ON v_orders_with_risk TO authenticated;
ALTER VIEW v_orders_with_risk SET (security_invoker = true);

-- 5. Backfill existing orders
-- Ensure default 'System' is set for all
UPDATE orders 
SET last_status_changed_by_name = 'System' 
WHERE last_status_changed_by_name IS NULL;

-- Then, update from history where available
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        WITH latest_history AS (
            SELECT DISTINCT ON (order_id) *
            FROM order_status_history
            ORDER BY order_id, changed_at DESC
        )
        SELECT lh.* FROM latest_history lh
    LOOP
        DECLARE
            v_name TEXT;
            v_avatar TEXT;
        BEGIN
            IF r.changed_by = 'whatsapp_bot' THEN
                v_name := 'WhatsApp Bot';
                v_avatar := 'bot';
            ELSE
                SELECT display_name, avatar_url 
                INTO v_name, v_avatar
                FROM user_profiles
                WHERE display_name = r.changed_by
                   OR email = r.changed_by
                LIMIT 1;

                IF v_name IS NULL THEN
                    v_name := r.changed_by;
                END IF;
            END IF;

            UPDATE orders 
            SET 
                last_status_changed_by_name = v_name,
                last_status_changed_by_avatar = v_avatar
            WHERE id = r.order_id;
        END;
    END LOOP;
END $$;
