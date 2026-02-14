-- =============================================
-- Orders Page Enhancement - Database Schema
-- Run this in Supabase SQL Editor
-- =============================================

-- =============================================
-- 1. ALTER ORDERS TABLE - Add new columns
-- =============================================

-- Scheduled delivery date
ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_date DATE;

-- Priority level for urgent orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal' 
  CHECK (priority IN ('normal', 'high', 'urgent'));

-- Payment status tracking
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'cod' 
  CHECK (payment_status IN ('pending', 'cod', 'prepaid', 'partial'));

-- Delivery fee (separate from product price)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) DEFAULT 0;

-- Discount amount applied
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0;

-- Return order flag
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_return BOOLEAN DEFAULT false;

-- Link to original order (for returns)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_order_id UUID REFERENCES orders(id);

-- Archived flag (for hiding old orders)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_date ON orders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_orders_priority ON orders(priority);
CREATE INDEX IF NOT EXISTS idx_orders_is_return ON orders(is_return);
CREATE INDEX IF NOT EXISTS idx_orders_is_archived ON orders(is_archived);

-- =============================================
-- 2. REJECTION REASONS TABLE
-- =============================================
-- Preset rejection reasons for employees to choose from

CREATE TABLE IF NOT EXISTS rejection_reasons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label TEXT NOT NULL UNIQUE,
  label_ar TEXT, -- Arabic label
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default rejection reasons
INSERT INTO rejection_reasons (label, label_ar, sort_order) VALUES
  ('Customer unreachable', 'العميل غير متاح', 1),
  ('Wrong phone number', 'رقم هاتف خاطئ', 2),
  ('Changed mind', 'غير رأيه', 3),
  ('Price too high', 'السعر مرتفع', 4),
  ('Found elsewhere', 'وجد في مكان آخر', 5),
  ('Duplicate order', 'طلب مكرر', 6),
  ('Out of delivery area', 'خارج نطاق التوصيل', 7),
  ('Product unavailable', 'المنتج غير متوفر', 8),
  ('Fraudulent order', 'طلب احتيالي', 9),
  ('Other', 'أخرى', 100)
ON CONFLICT (label) DO NOTHING;

-- Enable RLS
ALTER TABLE rejection_reasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for all" ON rejection_reasons FOR SELECT USING (true);
CREATE POLICY "Allow all for authenticated" ON rejection_reasons FOR ALL 
  USING (auth.role() = 'authenticated') 
  WITH CHECK (auth.role() = 'authenticated');

-- =============================================
-- 3. ORDER NOTES TABLE
-- =============================================
-- Quick notes added to orders

CREATE TABLE IF NOT EXISTS order_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_notes_order_id ON order_notes(order_id);
CREATE INDEX IF NOT EXISTS idx_order_notes_created_at ON order_notes(created_at DESC);

-- Enable RLS
ALTER TABLE order_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON order_notes FOR ALL 
  USING (auth.role() = 'authenticated') 
  WITH CHECK (auth.role() = 'authenticated');

-- =============================================
-- 4. ORDER STATUS HISTORY TABLE
-- =============================================
-- Track all status changes for timeline view

CREATE TABLE IF NOT EXISTS order_status_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by TEXT,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_status_history_changed_at ON order_status_history(changed_at DESC);

-- Enable RLS
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON order_status_history FOR ALL 
  USING (auth.role() = 'authenticated') 
  WITH CHECK (auth.role() = 'authenticated');

-- Trigger to auto-record status changes
CREATE OR REPLACE FUNCTION record_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO order_status_history (order_id, from_status, to_status)
    VALUES (NEW.id, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_order_status_change ON orders;
CREATE TRIGGER on_order_status_change
  AFTER UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION record_status_change();

-- =============================================
-- 5. FILTER PRESETS TABLE
-- =============================================
-- Saved filter configurations

CREATE TABLE IF NOT EXISTS filter_presets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '{}'::jsonb,
  page TEXT NOT NULL DEFAULT 'orders', -- Which page this preset belongs to
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_filter_presets_page ON filter_presets(page);

-- Enable RLS
ALTER TABLE filter_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON filter_presets FOR ALL 
  USING (auth.role() = 'authenticated') 
  WITH CHECK (auth.role() = 'authenticated');

-- =============================================
-- 6. MESSAGE TEMPLATES TABLE
-- =============================================
-- WhatsApp message templates

CREATE TABLE IF NOT EXISTS message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  content_ar TEXT, -- Arabic version
  category TEXT DEFAULT 'general', -- general, confirmation, shipping, delay, etc.
  variables TEXT[] DEFAULT '{}', -- Placeholder variables like {{customer_name}}
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default templates
INSERT INTO message_templates (name, content, content_ar, category, variables, sort_order) VALUES
  (
    'Order Confirmation',
    'Hello {{customer_name}}, your order #{{order_id}} has been confirmed! We will contact you soon for delivery.',
    'مرحباً {{customer_name}}، تم تأكيد طلبك رقم #{{order_id}}! سنتواصل معك قريباً للتوصيل.',
    'confirmation',
    ARRAY['customer_name', 'order_id'],
    1
  ),
  (
    'Shipping Update',
    'Hello {{customer_name}}, your order #{{order_id}} is on its way! Expected delivery: {{scheduled_date}}.',
    'مرحباً {{customer_name}}، طلبك رقم #{{order_id}} في الطريق إليك! موعد التوصيل المتوقع: {{scheduled_date}}.',
    'shipping',
    ARRAY['customer_name', 'order_id', 'scheduled_date'],
    2
  ),
  (
    'Delivery Delay',
    'Hello {{customer_name}}, we apologize but your order #{{order_id}} will be delayed. New expected date: {{scheduled_date}}.',
    'مرحباً {{customer_name}}، نعتذر عن تأخير طلبك رقم #{{order_id}}. الموعد الجديد: {{scheduled_date}}.',
    'delay',
    ARRAY['customer_name', 'order_id', 'scheduled_date'],
    3
  ),
  (
    'Payment Reminder',
    'Hello {{customer_name}}, this is a reminder about your order #{{order_id}}. Total: {{price}} IQD.',
    'مرحباً {{customer_name}}، هذا تذكير بخصوص طلبك رقم #{{order_id}}. المبلغ: {{price}} دينار.',
    'payment',
    ARRAY['customer_name', 'order_id', 'price'],
    4
  ),
  (
    'Follow Up',
    'Hello {{customer_name}}, we tried to reach you regarding order #{{order_id}}. Please contact us.',
    'مرحباً {{customer_name}}، حاولنا التواصل معك بخصوص طلب #{{order_id}}. يرجى التواصل معنا.',
    'follow_up',
    ARRAY['customer_name', 'order_id'],
    5
  )
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read for all" ON message_templates FOR SELECT USING (true);
CREATE POLICY "Allow all for authenticated" ON message_templates FOR ALL 
  USING (auth.role() = 'authenticated') 
  WITH CHECK (auth.role() = 'authenticated');

-- =============================================
-- 7. FOLLOW UP REMINDERS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS follow_up_reminders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  reminder_date TIMESTAMPTZ NOT NULL,
  note TEXT,
  is_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_order_id ON follow_up_reminders(order_id);
CREATE INDEX IF NOT EXISTS idx_reminders_date ON follow_up_reminders(reminder_date);
CREATE INDEX IF NOT EXISTS idx_reminders_completed ON follow_up_reminders(is_completed);

-- Enable RLS
ALTER TABLE follow_up_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated" ON follow_up_reminders FOR ALL 
  USING (auth.role() = 'authenticated') 
  WITH CHECK (auth.role() = 'authenticated');

-- =============================================
-- 8. COMMENTS/DOCUMENTATION
-- =============================================

COMMENT ON COLUMN orders.scheduled_date IS 'Customer requested delivery date';
COMMENT ON COLUMN orders.priority IS 'Order priority: normal, high, urgent';
COMMENT ON COLUMN orders.payment_status IS 'Payment status: pending, cod, prepaid, partial';
COMMENT ON COLUMN orders.is_return IS 'True if this is a return order';
COMMENT ON COLUMN orders.original_order_id IS 'Reference to original order for returns';

COMMENT ON TABLE rejection_reasons IS 'Preset rejection reasons for employees';
COMMENT ON TABLE order_notes IS 'Quick notes attached to orders';
COMMENT ON TABLE order_status_history IS 'Full status change history for timeline';
COMMENT ON TABLE filter_presets IS 'Saved filter configurations';
COMMENT ON TABLE message_templates IS 'WhatsApp message templates';
COMMENT ON TABLE follow_up_reminders IS 'Follow-up reminder scheduling';

-- =============================================
-- DONE! Run this in Supabase SQL Editor
-- =============================================
