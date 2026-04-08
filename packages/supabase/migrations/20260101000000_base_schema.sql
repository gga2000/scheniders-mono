-- ============================================================
-- BASE SCHEMA - Scheniders Platform
-- ============================================================
-- This migration creates the full base schema for the platform.
-- It consolidates all pre-existing tables that were created
-- directly in Supabase (not via timestamped migrations).
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;

-- Use gen_random_uuid() as fallback (built-in, no extension needed)
-- Map uuid_generate_v4 to gen_random_uuid for compatibility
CREATE OR REPLACE FUNCTION uuid_generate_v4()
RETURNS uuid
LANGUAGE sql
AS $$ SELECT gen_random_uuid(); $$;

-- ============================================================
-- ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.customer_status AS ENUM ('new', 'regular', 'vip');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.tag_color AS ENUM ('yellow', 'green', 'blue', 'pink', 'purple', 'orange', 'red', 'gray');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- CORE TABLES
-- ============================================================

-- User Profiles
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id uuid NOT NULL,
  email varchar(255) NOT NULL,
  display_name varchar(255),
  role varchar(50) DEFAULT 'employee',
  avatar_url text,
  is_active bool DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  total_actions_count int4 DEFAULT 0,
  weekly_actions_count int4 DEFAULT 0,
  monthly_actions_count int4 DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT user_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Products
CREATE TABLE IF NOT EXISTS public.products (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  name text NOT NULL,
  description text,
  price numeric NOT NULL DEFAULT 0,
  cost numeric DEFAULT 0,
  stock_quantity int4 DEFAULT 0,
  low_stock_threshold int4 DEFAULT 5,
  image_url text,
  is_archived bool DEFAULT false,
  tag_color text DEFAULT '#22c55e',
  compare_at_price numeric,
  sku text,
  lightfunnels_aliases text[] DEFAULT '{}',
  reserved_quantity int4 NOT NULL DEFAULT 0,
  is_supply bool NOT NULL DEFAULT false,
  PRIMARY KEY (id)
);

-- Product Variants
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  product_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  name text NOT NULL,
  price numeric,
  cost numeric,
  stock_quantity int4 DEFAULT 0,
  sku text,
  PRIMARY KEY (id),
  CONSTRAINT product_variants_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE
);

-- Orders
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  order_id text NOT NULL,
  customer_name text NOT NULL,
  phone text NOT NULL,
  city text,
  governorate_code text,
  address_details text,
  items jsonb NOT NULL DEFAULT '[]',
  price numeric NOT NULL,
  status text NOT NULL DEFAULT 'new',
  whatsapp_link text,
  notes text,
  rejection_reason text,
  scheduled_date date,
  priority text DEFAULT 'normal',
  payment_status text DEFAULT 'cod',
  delivery_fee numeric DEFAULT 0,
  discount_amount numeric DEFAULT 0,
  is_return bool DEFAULT false,
  original_order_id uuid,
  is_archived bool DEFAULT false,
  secondary_phone text,
  delivery_slot text,
  source text,
  sequence_number int4,
  delivered_at timestamp,
  cancelled_at timestamp,
  printed_at timestamptz,
  print_count int4 DEFAULT 0,
  last_batch_id uuid,
  is_gift bool DEFAULT false,
  tag_color text,
  is_pinned bool DEFAULT false,
  delivery_order_id text,
  is_reviewed bool DEFAULT false,
  is_verified_customer bool DEFAULT false,
  contact_count int4 DEFAULT 0,
  address_status text DEFAULT 'needs_review',
  address_issues text[] DEFAULT '{}',
  validated_governorate_code text,
  internal_notes text,
  assigned_to uuid,
  assigned_at timestamptz,
  product_cost numeric,
  net_profit numeric,
  is_shop_order bool DEFAULT false,
  risk_metadata jsonb DEFAULT '{}',
  needs_attention bool DEFAULT false,
  attention_reasons text[] DEFAULT '{}',
  original_created_at timestamptz,
  last_contacted_at timestamptz,
  last_status_changed_by_name text DEFAULT 'System',
  last_status_changed_by_avatar text,
  is_test bool DEFAULT false,
  delivery_note text,
  is_replacement bool DEFAULT false,
  delivery_company text,
  waseet_qr_id text,
  waseet_qr_link text,
  waseet_status_id int4,
  waseet_status_text text,
  waseet_merchant_price numeric,
  waseet_company_price numeric,
  waseet_submitted_at timestamptz,
  waseet_invoice_id text,
  completed_at timestamptz,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_id_key ON public.orders(order_id);

-- Blacklist
CREATE TABLE IF NOT EXISTS public.blacklist (
  phone text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  added_by text,
  notes text,
  PRIMARY KEY (phone)
);

-- Rejection Reasons
CREATE TABLE IF NOT EXISTS public.rejection_reasons (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  label text NOT NULL,
  label_ar text,
  sort_order int4 DEFAULT 0,
  is_active bool DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- Message Templates
CREATE TABLE IF NOT EXISTS public.message_templates (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  content text NOT NULL,
  content_ar text,
  category text DEFAULT 'general',
  variables text[] DEFAULT '{}',
  sort_order int4 DEFAULT 0,
  is_active bool DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  template_type text,
  discount_percentage int4 DEFAULT 10,
  PRIMARY KEY (id)
);

-- App Settings
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text NOT NULL,
  value jsonb NOT NULL DEFAULT '{}',
  description text,
  updated_at timestamptz DEFAULT now(),
  updated_by text,
  PRIMARY KEY (key)
);

-- Settings (simple key/value)
CREATE TABLE IF NOT EXISTS public.settings (
  key text NOT NULL,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key)
);

-- ============================================================
-- ORDER RELATED TABLES
-- ============================================================

-- Order Status History
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  PRIMARY KEY (id),
  CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE
);

-- Order Notes
CREATE TABLE IF NOT EXISTS public.order_notes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL,
  note text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT order_notes_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE
);

-- Order Notifications
CREATE TABLE IF NOT EXISTS public.order_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid,
  order_display_id text NOT NULL,
  type text NOT NULL,
  user_name text NOT NULL,
  user_avatar text,
  message text NOT NULL,
  old_status text,
  new_status text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  is_read bool DEFAULT false,
  PRIMARY KEY (id)
);

-- Follow Up Reminders
CREATE TABLE IF NOT EXISTS public.follow_up_reminders (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  order_id uuid NOT NULL,
  reminder_date timestamptz NOT NULL,
  note text,
  is_completed bool DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT follow_up_reminders_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE
);

-- Print Batches
CREATE TABLE IF NOT EXISTS public.print_batches (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  order_count int4 DEFAULT 0,
  total_value numeric DEFAULT 0,
  cities text[],
  pdf_url text,
  order_ids text[] DEFAULT '{}',
  invoice_template text DEFAULT 'prime',
  print_type text DEFAULT 'invoice',
  sequence_order text[],
  pick_list jsonb,
  efficiency_score float8,
  strategy text,
  context_switches int4,
  PRIMARY KEY (id)
);

-- Print History
CREATE TABLE IF NOT EXISTS public.print_history (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  order_id uuid,
  batch_id uuid,
  printed_at timestamptz DEFAULT now(),
  print_type text,
  label_size text,
  printed_by text,
  PRIMARY KEY (id)
);

-- Filter Presets
CREATE TABLE IF NOT EXISTS public.filter_presets (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '{}',
  page text NOT NULL DEFAULT 'orders',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- Checkout Queue
CREATE TABLE IF NOT EXISTS public.checkout_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  checkout_id text NOT NULL,
  process_after timestamptz NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  attempts int4 NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamptz,
  PRIMARY KEY (id)
);

-- ============================================================
-- CUSTOMER TABLES
-- ============================================================

-- Customer Metadata
CREATE TABLE IF NOT EXISTS public.customer_metadata (
  customer_phone text NOT NULL,
  birthday date,
  manual_status public.customer_status,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (customer_phone)
);

-- Customer Notes
CREATE TABLE IF NOT EXISTS public.customer_notes (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  customer_phone text NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

-- Customer Tags
CREATE TABLE IF NOT EXISTS public.customer_tags (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  color public.tag_color NOT NULL DEFAULT 'blue',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- Customer Tag Assignments
CREATE TABLE IF NOT EXISTS public.customer_tag_assignments (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  customer_phone text NOT NULL,
  tag_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT customer_tag_assignments_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES public.customer_tags(id) ON DELETE CASCADE
);

-- Customer Filter Presets
CREATE TABLE IF NOT EXISTS public.customer_filter_presets (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  user_id text,
  filters jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- Customer Risk
CREATE TABLE IF NOT EXISTS public.customer_risk (
  phone text NOT NULL,
  risk_level text NOT NULL,
  score int4 NOT NULL DEFAULT 0,
  reasons text[] DEFAULT '{}',
  stats jsonb DEFAULT '{}',
  last_order_date timestamptz,
  last_updated timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (phone)
);

-- Customer Whitelist
CREATE TABLE IF NOT EXISTS public.customer_whitelist (
  phone text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (phone)
);

-- ============================================================
-- TEAM & PERMISSIONS TABLES
-- ============================================================

-- Role Permissions
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role varchar(50) NOT NULL,
  permission varchar(100) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (role, permission)
);

-- User Permissions
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  permission text NOT NULL,
  is_granted bool NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (id),
  CONSTRAINT user_permissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- ============================================================
-- OPERATIONAL TABLES
-- ============================================================

-- Expenses
CREATE TABLE IF NOT EXISTS public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  expense_date date NOT NULL,
  category text NOT NULL,
  description text,
  amount numeric NOT NULL DEFAULT 0,
  order_id uuid,
  notes text,
  is_recurring bool DEFAULT false,
  recurring_period text,
  PRIMARY KEY (id)
);

-- Activity Logs
CREATE TABLE IF NOT EXISTS public.activity_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb DEFAULT '{}',
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (id)
);

-- WhatsApp Logs
CREATE TABLE IF NOT EXISTS public.whatsapp_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id text NOT NULL,
  order_uuid uuid,
  phone text NOT NULL,
  template_name text NOT NULL,
  direction text NOT NULL DEFAULT 'outbound',
  status text NOT NULL DEFAULT 'sent',
  interakt_message_id text,
  payload jsonb,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id)
);

-- Security Logs
CREATE TABLE IF NOT EXISTS public.security_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  action varchar(255) NOT NULL,
  details jsonb DEFAULT '{}',
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (id)
);

-- Announcements
CREATE TABLE IF NOT EXISTS public.announcements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  content text NOT NULL,
  created_by_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  is_pinned bool NOT NULL DEFAULT false,
  is_active bool NOT NULL DEFAULT true,
  PRIMARY KEY (id)
);

-- QC Quarantine
CREATE TABLE IF NOT EXISTS public.qc_quarantine (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  order_id uuid,
  product_id uuid,
  quantity int4 NOT NULL,
  status text NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  resolved_at timestamptz,
  resolved_by uuid,
  notes text,
  PRIMARY KEY (id)
);

-- ============================================================
-- DELIVERY TABLES
-- ============================================================

-- Delivery Imports
CREATE TABLE IF NOT EXISTS public.delivery_imports (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  receipt_number text NOT NULL,
  payment_date timestamptz NOT NULL,
  receiving_agent text,
  total_orders int4 NOT NULL,
  total_amount int4 NOT NULL,
  processed_count int4 DEFAULT 0,
  skipped_count int4 DEFAULT 0,
  failed_count int4 DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  imported_by uuid,
  confirmed_by uuid,
  created_at timestamptz DEFAULT now(),
  confirmed_at timestamptz,
  pdf_filename text,
  raw_data jsonb NOT NULL,
  actual_amount_received int4,
  PRIMARY KEY (id)
);

-- Delivery Import Items
CREATE TABLE IF NOT EXISTS public.delivery_import_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  import_id uuid NOT NULL,
  order_id uuid,
  pdf_row_number int4 NOT NULL,
  pdf_shipment_number text,
  pdf_phone text,
  pdf_amount int4,
  pdf_delivery_fee int4,
  pdf_net_amount int4,
  pdf_status text,
  pdf_item_count int4,
  pdf_notes text,
  match_category text NOT NULL,
  match_details jsonb,
  action text DEFAULT 'pending',
  previous_status text,
  new_status text,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT delivery_import_items_import_id_fkey FOREIGN KEY (import_id) REFERENCES public.delivery_imports(id) ON DELETE CASCADE
);

-- Waseet City Mappings
CREATE TABLE IF NOT EXISTS public.waseet_city_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  governorate_code text NOT NULL,
  governorate_name_ar text NOT NULL,
  waseet_city_id int4 NOT NULL,
  waseet_city_name text NOT NULL,
  waseet_default_region_id int4,
  waseet_default_region_name text,
  is_active bool DEFAULT true,
  PRIMARY KEY (id)
);

-- Waseet API Logs
CREATE TABLE IF NOT EXISTS public.waseet_api_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  endpoint text NOT NULL,
  method text NOT NULL,
  request_data jsonb,
  response_data jsonb,
  http_status int4,
  success bool NOT NULL DEFAULT false,
  error_message text,
  order_id uuid,
  duration_ms int4,
  triggered_by text DEFAULT 'manual',
  PRIMARY KEY (id)
);

-- ============================================================
-- FUNCTIONS
-- ============================================================

-- Normalize phone numbers (convert Arabic/Persian digits, strip country code)
CREATE OR REPLACE FUNCTION public.normalize_phone(input_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
    clean_phone TEXT;
BEGIN
    clean_phone := translate(input_phone, '٠١٢٣٤٥٦٧٨٩', '0123456789');
    clean_phone := translate(clean_phone, '۰۱۲۳۴۵۶۷۸۹', '0123456789');
    clean_phone := regexp_replace(clean_phone, '\D', '', 'g');
    IF clean_phone LIKE '964%' THEN
        clean_phone := substring(clean_phone FROM 4);
    END IF;
    IF clean_phone LIKE '0%' THEN
        clean_phone := substring(clean_phone FROM 2);
    END IF;
    RETURN clean_phone;
END;
$function$;

-- ============================================================
-- MATERIALIZED VIEW: Customer Aggregates
-- ============================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_customer_aggregates AS
WITH order_stats AS (
  SELECT
    orders.id,
    orders.phone,
    orders.customer_name,
    orders.city,
    orders.governorate_code,
    orders.price,
    orders.created_at,
    orders.status,
    (SELECT COALESCE(sum((item.value->>'quantity')::numeric), 0)
     FROM jsonb_array_elements(
       CASE WHEN jsonb_typeof(orders.items) = 'array' THEN orders.items ELSE '[]'::jsonb END
     ) item(value)) AS order_items_count
  FROM orders
),
last_order_details AS (
  SELECT DISTINCT ON (orders.phone)
    orders.phone,
    orders.id AS last_order_id,
    orders.status AS last_order_status,
    orders.secondary_phone AS latest_secondary_phone,
    orders.address_details AS latest_address_details
  FROM orders
  ORDER BY orders.phone, orders.created_at DESC
)
SELECT
  o.phone AS customer_phone,
  max(o.customer_name) AS latest_name,
  max(o.city) AS latest_city,
  max(o.governorate_code) AS latest_governorate,
  count(o.id) AS total_orders,
  sum(o.price) AS total_spent,
  max(o.created_at) AS last_order_date,
  min(o.created_at) AS first_order_date,
  COALESCE(sum(o.order_items_count), 0) AS total_items,
  l.last_order_id,
  l.last_order_status,
  l.latest_secondary_phone,
  l.latest_address_details
FROM (order_stats o LEFT JOIN last_order_details l ON (o.phone = l.phone))
GROUP BY o.phone, l.last_order_id, l.last_order_status, l.latest_secondary_phone, l.latest_address_details;

CREATE UNIQUE INDEX IF NOT EXISTS mv_customer_aggregates_phone_idx ON public.mv_customer_aggregates(customer_phone);

-- Paginated customers function
CREATE OR REPLACE FUNCTION public.get_paginated_customers(
  search_query text DEFAULT NULL,
  status_filter text DEFAULT NULL,
  city_filter text DEFAULT NULL,
  sort_by text DEFAULT 'last_order_date',
  sort_desc boolean DEFAULT true,
  page_limit integer DEFAULT 20,
  page_offset integer DEFAULT 0,
  min_ltv numeric DEFAULT NULL,
  max_ltv numeric DEFAULT NULL,
  last_order_within_days integer DEFAULT NULL,
  tag_id_filter text DEFAULT NULL
)
RETURNS TABLE(
  phone text, name text, city text, governorate text,
  total_orders bigint, total_spent numeric,
  last_order_date timestamptz, first_order_date timestamptz,
  calculated_status text, is_blacklisted boolean,
  total_items numeric, last_order_id uuid, last_order_status text,
  secondary_phone text, address_details text, total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH base_query AS (
    SELECT
      c.customer_phone, c.latest_name, c.latest_city, c.latest_governorate,
      c.total_orders, c.total_spent, c.last_order_date, c.first_order_date,
      c.total_items, c.last_order_id, c.last_order_status,
      c.latest_secondary_phone, c.latest_address_details,
      COALESCE(
        cm.manual_status::TEXT,
        CASE
          WHEN c.total_orders >= 5 OR c.total_spent >= 500000 THEN 'vip'
          WHEN c.total_orders >= 2 THEN 'regular'
          ELSE 'new'
        END
      ) as cust_status,
      COALESCE(b.phone IS NOT NULL, FALSE) as blacklisted
    FROM mv_customer_aggregates c
    LEFT JOIN customer_metadata cm ON c.customer_phone = cm.customer_phone
    LEFT JOIN blacklist b ON c.customer_phone = b.phone
    WHERE
      (search_query IS NULL OR search_query = '' OR
       c.latest_name ILIKE '%' || search_query || '%' OR
       c.customer_phone ILIKE '%' || search_query || '%' OR
       c.latest_city ILIKE '%' || search_query || '%')
      AND (city_filter IS NULL OR city_filter = '' OR c.latest_city ILIKE '%' || city_filter || '%')
      AND (min_ltv IS NULL OR c.total_spent >= min_ltv)
      AND (max_ltv IS NULL OR c.total_spent <= max_ltv)
      AND (last_order_within_days IS NULL OR c.last_order_date >= NOW() - (last_order_within_days || ' days')::interval)
  ),
  filtered_query AS (
    SELECT bq.* FROM base_query bq
    WHERE
      (status_filter IS NULL OR status_filter = '' OR status_filter = 'all' OR bq.cust_status = status_filter)
      AND (tag_id_filter IS NULL OR tag_id_filter = '' OR EXISTS (
        SELECT 1 FROM customer_tag_assignments cta
        WHERE cta.customer_phone = bq.customer_phone AND cta.tag_id = tag_id_filter::uuid
      ))
  ),
  counted_query AS (SELECT COUNT(*) as exact_count FROM filtered_query)
  SELECT
    q.customer_phone, q.latest_name, q.latest_city, q.latest_governorate,
    q.total_orders, q.total_spent, q.last_order_date, q.first_order_date,
    q.cust_status, q.blacklisted, q.total_items, q.last_order_id,
    q.last_order_status, q.latest_secondary_phone, q.latest_address_details,
    cq.exact_count
  FROM filtered_query q
  CROSS JOIN counted_query cq
  ORDER BY
    CASE WHEN sort_by = 'total_spent' AND sort_desc THEN q.total_spent END DESC NULLS LAST,
    CASE WHEN sort_by = 'total_spent' AND NOT sort_desc THEN q.total_spent END ASC NULLS LAST,
    CASE WHEN sort_by = 'total_orders' AND sort_desc THEN q.total_orders END DESC NULLS LAST,
    CASE WHEN sort_by = 'total_orders' AND NOT sort_desc THEN q.total_orders END ASC NULLS LAST,
    CASE WHEN sort_by = 'name' AND sort_desc THEN q.latest_name END DESC NULLS LAST,
    CASE WHEN sort_by = 'name' AND NOT sort_desc THEN q.latest_name END ASC NULLS LAST,
    CASE WHEN (sort_by = 'last_order_date' OR sort_by IS NULL OR sort_by = '') AND sort_desc THEN q.last_order_date END DESC NULLS LAST,
    CASE WHEN (sort_by = 'last_order_date' OR sort_by IS NULL OR sort_by = '') AND NOT sort_desc THEN q.last_order_date END ASC NULLS LAST
  LIMIT page_limit
  OFFSET page_offset;
END;
$function$;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(phone);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_assigned_to ON public.orders(assigned_to);
CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON public.order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON public.activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON public.activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_order_uuid ON public.whatsapp_logs(order_uuid);
CREATE INDEX IF NOT EXISTS idx_order_notifications_created_at ON public.order_notifications(created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filter_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follow_up_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_filter_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_risk ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_import_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waseet_city_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waseet_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_whitelist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qc_quarantine ENABLE ROW LEVEL SECURITY;

-- Basic RLS: authenticated users can access everything (will be tightened with multi-tenancy)
CREATE POLICY "Authenticated users can access user_profiles" ON public.user_profiles
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access orders" ON public.orders
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access products" ON public.products
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access product_variants" ON public.product_variants
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access blacklist" ON public.blacklist
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access order_status_history" ON public.order_status_history
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access order_notes" ON public.order_notes
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access order_notifications" ON public.order_notifications
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access print_batches" ON public.print_batches
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access print_history" ON public.print_history
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access filter_presets" ON public.filter_presets
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access follow_up_reminders" ON public.follow_up_reminders
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access message_templates" ON public.message_templates
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access app_settings" ON public.app_settings
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access customer_notes" ON public.customer_notes
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access customer_tags" ON public.customer_tags
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access customer_tag_assignments" ON public.customer_tag_assignments
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access customer_filter_presets" ON public.customer_filter_presets
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access customer_risk" ON public.customer_risk
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access expenses" ON public.expenses
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access activity_logs" ON public.activity_logs
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access whatsapp_logs" ON public.whatsapp_logs
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access role_permissions" ON public.role_permissions
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access user_permissions" ON public.user_permissions
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access delivery_imports" ON public.delivery_imports
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access delivery_import_items" ON public.delivery_import_items
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access waseet_city_mappings" ON public.waseet_city_mappings
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access waseet_api_logs" ON public.waseet_api_logs
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access announcements" ON public.announcements
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access customer_whitelist" ON public.customer_whitelist
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can access qc_quarantine" ON public.qc_quarantine
  FOR ALL USING (auth.role() = 'authenticated');
