-- last_actor_avatar
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS last_status_changed_by_name TEXT DEFAULT 'System',
ADD COLUMN IF NOT EXISTS last_status_changed_by_avatar TEXT;

CREATE OR REPLACE FUNCTION public.update_order_last_actor()
RETURNS TRIGGER AS $$
DECLARE v_actor_name TEXT; v_actor_avatar TEXT;
BEGIN
  IF (NEW.changed_by = 'whatsapp_bot') THEN
    v_actor_name := 'WhatsApp Bot'; v_actor_avatar := 'bot'; 
  ELSE
    SELECT display_name, avatar_url INTO v_actor_name, v_actor_avatar
    FROM user_profiles WHERE display_name = NEW.changed_by OR email = NEW.changed_by LIMIT 1;
    IF v_actor_name IS NULL AND NEW.changed_by IS NOT NULL THEN v_actor_name := NEW.changed_by; END IF;
  END IF;
  IF v_actor_name IS NOT NULL THEN
    UPDATE orders SET last_status_changed_by_name = v_actor_name, last_status_changed_by_avatar = v_actor_avatar WHERE id = NEW.order_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_order_last_actor ON order_status_history;
CREATE TRIGGER trigger_update_order_last_actor
AFTER INSERT ON order_status_history FOR EACH ROW EXECUTE FUNCTION public.update_order_last_actor();

DROP VIEW IF EXISTS v_orders_with_risk;
CREATE VIEW v_orders_with_risk AS
SELECT o.*,
  (SELECT jsonb_build_object('level', cr.risk_level, 'score', cr.score, 'reasons', cr.reasons, 'stats', cr.stats, 'last_updated', cr.last_updated)
   FROM customer_risk cr WHERE cr.phone = normalize_phone(o.phone) OR cr.phone = normalize_phone(o.secondary_phone)
   ORDER BY cr.last_updated DESC LIMIT 1) as risk_data
FROM orders o;
GRANT SELECT ON v_orders_with_risk TO authenticated;
ALTER VIEW v_orders_with_risk SET (security_invoker = true);

UPDATE orders SET last_status_changed_by_name = 'System' WHERE last_status_changed_by_name IS NULL;

-- add_is_test_column
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_test BOOLEAN DEFAULT false;

-- smart_batching
ALTER TABLE print_batches
  ADD COLUMN IF NOT EXISTS sequence_order TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS pick_list JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS efficiency_score FLOAT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS strategy TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS context_switches INT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_print_batches_strategy ON print_batches(strategy);
CREATE INDEX IF NOT EXISTS idx_print_batches_efficiency ON print_batches(efficiency_score DESC);

-- persistent_notifications (table already exists, just fix policies)
DROP POLICY IF EXISTS "Authenticated users can view all notifications" ON public.order_notifications;
DROP POLICY IF EXISTS "Enable all access for notifications" ON public.order_notifications;
DROP POLICY IF EXISTS "Triggers can insert notifications" ON public.order_notifications;

CREATE POLICY "Enable read access for all" ON public.order_notifications FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Enable insert for all" ON public.order_notifications FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Enable update for read status" ON public.order_notifications FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DO $$ 
BEGIN 
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='order_notifications' AND column_name='is_read') THEN
    ALTER TABLE public.order_notifications ADD COLUMN is_read BOOLEAN DEFAULT false;
  END IF;
END $$;;
