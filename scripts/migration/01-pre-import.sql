-- =====================================================================
-- 01-pre-import: wipe Scheniders Iraq operational data + disable triggers
-- =====================================================================
-- Idempotent. Safe to re-run.
-- Scope: ONLY rows with tenant_id = b5c4f2d4-834f-4af4-822d-9b9826a8f45a.
-- Other 12 tenants are untouched.
-- Tenant infrastructure (tenants row, subscriptions, wallet, wallet_transactions,
-- tenant_members, usage_tracking) is preserved.

DO $$
DECLARE
  v_tenant uuid := 'b5c4f2d4-834f-4af4-822d-9b9826a8f45a'::uuid;
  v_deleted bigint;
BEGIN
  -- Children of orders (cascading FKs would handle this but explicit is safer)
  DELETE FROM public.order_status_history
    WHERE order_id IN (SELECT id FROM public.orders WHERE tenant_id = v_tenant);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'wiped % rows from order_status_history', v_deleted;

  DELETE FROM public.order_notifications
    WHERE order_id IN (SELECT id FROM public.orders WHERE tenant_id = v_tenant);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'wiped % rows from order_notifications', v_deleted;

  DELETE FROM public.whatsapp_logs WHERE tenant_id = v_tenant;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'wiped % rows from whatsapp_logs', v_deleted;

  DELETE FROM public.activity_logs WHERE tenant_id = v_tenant;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'wiped % rows from activity_logs', v_deleted;

  DELETE FROM public.qc_quarantine WHERE tenant_id = v_tenant;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RAISE NOTICE 'wiped % rows from qc_quarantine', v_deleted;

  DELETE FROM public.qc_quarantine_events WHERE tenant_id = v_tenant;
  DELETE FROM public.print_history WHERE tenant_id = v_tenant;
  DELETE FROM public.print_batches WHERE tenant_id = v_tenant;
  DELETE FROM public.delivery_import_items WHERE tenant_id = v_tenant;
  DELETE FROM public.delivery_imports WHERE tenant_id = v_tenant;
  DELETE FROM public.waseet_api_logs WHERE tenant_id = v_tenant;
  DELETE FROM public.inventory_ledger WHERE tenant_id = v_tenant;
  DELETE FROM public.customer_trust WHERE tenant_id = v_tenant;
  DELETE FROM public.checkout_queue WHERE tenant_id = v_tenant;
  DELETE FROM public.expenses WHERE tenant_id = v_tenant;
  DELETE FROM public.payroll_records WHERE tenant_id = v_tenant;
  DELETE FROM public.salary_config_history WHERE tenant_id = v_tenant;
  DELETE FROM public.employee_salary_configs WHERE tenant_id = v_tenant;
  DELETE FROM public.role_salary_defaults WHERE tenant_id = v_tenant;
  DELETE FROM public.message_templates WHERE tenant_id = v_tenant;
  -- product_price_history + order_reasons do not exist in new project.
  DELETE FROM public.product_categories
    WHERE product_id IN (SELECT id FROM public.products WHERE tenant_id = v_tenant);
  DELETE FROM public.categories WHERE tenant_id = v_tenant;
  DELETE FROM public.products WHERE tenant_id = v_tenant;
  DELETE FROM public.orders WHERE tenant_id = v_tenant;
  DELETE FROM public.rejection_reasons WHERE tenant_id = v_tenant;
  DELETE FROM public.waseet_city_mappings WHERE tenant_id = v_tenant;
  DELETE FROM public.customer_filter_presets WHERE tenant_id = v_tenant;
  DELETE FROM public.announcements WHERE tenant_id = v_tenant;
  DELETE FROM public.blacklist WHERE tenant_id = v_tenant;
  DELETE FROM public.telegram_pending_orders WHERE tenant_id = v_tenant;
  DELETE FROM public.telegram_link_codes WHERE tenant_id = v_tenant;
  DELETE FROM public.telegram_employee_link WHERE tenant_id = v_tenant;
  DELETE FROM public.app_settings WHERE tenant_id = v_tenant;
  DELETE FROM public.settings WHERE tenant_id = v_tenant;
  DELETE FROM public.customer_notes WHERE tenant_id = v_tenant;
  DELETE FROM public.admin_watchlist WHERE tenant_id = v_tenant;

  RAISE NOTICE 'WIPE COMPLETE for tenant %', v_tenant;
END $$;

-- Disable high-volume triggers during bulk insert.
-- (Re-enabled in 03-post-import.sql.)
-- USER triggers only — we never disable RI (foreign-key) triggers.
ALTER TABLE public.orders DISABLE TRIGGER USER;
ALTER TABLE public.order_status_history DISABLE TRIGGER USER;
ALTER TABLE public.order_notifications DISABLE TRIGGER USER;
ALTER TABLE public.whatsapp_logs DISABLE TRIGGER USER;
ALTER TABLE public.activity_logs DISABLE TRIGGER USER;
ALTER TABLE public.products DISABLE TRIGGER USER;
ALTER TABLE public.customer_trust DISABLE TRIGGER USER;
ALTER TABLE public.qc_quarantine DISABLE TRIGGER USER;
ALTER TABLE public.inventory_ledger DISABLE TRIGGER USER;

SELECT 'pre-import complete' AS status;
