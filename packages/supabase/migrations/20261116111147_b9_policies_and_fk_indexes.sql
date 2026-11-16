-- Fermi B9 (slow database queries), part 1: the advisor's cheap, safe fixes.
--
-- 1. Row security policies that called auth.uid() / auth.role() once per row
--    now call it once per query: the same call written as (SELECT auth.uid()),
--    which Postgres runs once as an initplan (Supabase lint 0003). Who can
--    read or write what does not change: only those calls are wrapped, every
--    other part of each policy is kept as it is.
-- 2. Every foreign key in public without a covering index gets one (lint 0001,
--    131 keys). Deleting a store, a user or a product checks each referencing
--    table; without the index that check reads the whole table.
-- 3. One of two identical indexes on iraq_district_areas (area_key) goes
--    (lint 0009); the busier idx_iraq_district_areas_key_lookup stays.

-- 1. Policies -----------------------------------------------------------------
-- auth.uid() -> (SELECT auth.uid()), auth.role() -> (SELECT auth.role()). A call
-- already wrapped (deparsed as "( SELECT auth.uid() AS uid)") is kept, so a
-- second run changes nothing.
CREATE FUNCTION pg_temp.b9_wrap_auth_calls(_expr text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $function$
    SELECT replace(replace(replace(replace(replace(replace(_expr,
               '( SELECT auth.uid() AS uid)', '@@b9_uid@@'),
               '( SELECT auth.role() AS role)', '@@b9_role@@'),
               'auth.uid()', '(SELECT auth.uid())'),
               'auth.role()', '(SELECT auth.role())'),
               '@@b9_uid@@', '( SELECT auth.uid() AS uid)'),
               '@@b9_role@@', '( SELECT auth.role() AS role)')
$function$;

DO $policies$
DECLARE
    _p record;
    _qual text;
    _check text;
    _sql text;
    _done integer := 0;
BEGIN
    FOR _p IN
        SELECT pol.tablename, pol.policyname, pol.qual, pol.with_check
          FROM pg_policies pol
          JOIN (VALUES
        ('access_requests', 'access_requests_superadmin_read'),
        ('admin_users', 'admin_users_read_own'),
        ('analytics_events', 'analytics_events_insert_own'),
        ('chat_conversations', 'chat_conversations_tenant_insert'),
        ('chat_members', 'chat_members_self_insert'),
        ('chat_members', 'chat_members_self_update'),
        ('chat_message_attachments', 'chat_attachments_member_insert'),
        ('chat_message_mentions', 'chat_mentions_member_insert'),
        ('chat_message_reactions', 'chat_reactions_self_write'),
        ('chat_message_references', 'chat_refs_member_insert'),
        ('chat_messages', 'chat_messages_author_update'),
        ('chat_messages', 'chat_messages_sender_insert'),
        ('chat_notification_prefs', 'chat_notification_prefs_self'),
        ('chat_push_subscriptions', 'chat_push_subscriptions_self'),
        ('chat_user_status', 'chat_user_status_self_write'),
        ('community_ratings', 'community_ratings_author_deletes'),
        ('community_ratings', 'community_ratings_author_updates'),
        ('notification_feed_state', 'notification_feed_state_rw'),
        ('notification_mutes', 'notification_mutes_self'),
        ('notification_prefs', 'notification_prefs_self'),
        ('notification_settings', 'notification_settings_self'),
        ('notification_user_state', 'notification_user_state_rw'),
        ('notifications', 'notifications_select'),
        ('role_permissions', 'authenticated_read_roles'),
        ('system_health_checks', 'system_health_checks_read'),
        ('telegram_employee_link', 'telegram_employee_link_tenant_admin_read'),
        ('tenant_members', 'member_select'),
        ('tenant_members', 'tenant_admin_delete_members'),
        ('tenant_members', 'tenant_admin_update_members'),
        ('user_profiles', 'user_read_own_profile'),
        ('user_profiles', 'user_update_own_profile')
          ) AS want(tablename, policyname)
            ON want.tablename = pol.tablename AND want.policyname = pol.policyname
         WHERE pol.schemaname = 'public'
    LOOP
        _qual := pg_temp.b9_wrap_auth_calls(_p.qual);
        _check := pg_temp.b9_wrap_auth_calls(_p.with_check);
        _done := _done + 1;
        IF _qual IS NOT DISTINCT FROM _p.qual AND _check IS NOT DISTINCT FROM _p.with_check THEN
            CONTINUE;
        END IF;
        _sql := format('ALTER POLICY %I ON public.%I', _p.policyname, _p.tablename);
        IF _qual IS NOT NULL THEN
            _sql := _sql || format(' USING (%s)', _qual);
        END IF;
        IF _check IS NOT NULL THEN
            _sql := _sql || format(' WITH CHECK (%s)', _check);
        END IF;
        EXECUTE _sql;
    END LOOP;

    IF _done <> 31 THEN
        RAISE EXCEPTION 'B9: expected 31 policies, found %', _done;
    END IF;
    -- Nothing in public calls auth.uid() / auth.role() per row any more.
    IF EXISTS (
        SELECT 1 FROM pg_policies pol
         WHERE pol.schemaname = 'public'
           AND (pg_temp.b9_wrap_auth_calls(pol.qual) IS DISTINCT FROM pol.qual
                OR pg_temp.b9_wrap_auth_calls(pol.with_check) IS DISTINCT FROM pol.with_check)
    ) THEN
        RAISE EXCEPTION 'B9: a policy in public still calls auth.uid() or auth.role() per row';
    END IF;
END;
$policies$;

DROP FUNCTION pg_temp.b9_wrap_auth_calls(text);

-- 2. Foreign keys without an index ---------------------------------------------
CREATE INDEX IF NOT EXISTS idx_iraq_locations_postal_code_fk ON public.iraq_locations (postal_code);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_user_id_fk ON public.notification_deliveries (user_id);
CREATE INDEX IF NOT EXISTS idx_delivery_import_items_tenant_id_fk ON public.delivery_import_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_delivery_import_items_import_id_fk ON public.delivery_import_items (import_id);
CREATE INDEX IF NOT EXISTS idx_checkout_queue_tenant_id_fk ON public.checkout_queue (tenant_id);
CREATE INDEX IF NOT EXISTS idx_print_history_tenant_id_fk ON public.print_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id_fk ON public.analytics_events (user_id);
CREATE INDEX IF NOT EXISTS idx_waseet_districts_postal_code_fk ON public.waseet_districts (postal_code);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_order_id_fk ON public.abandoned_carts (order_id);
CREATE INDEX IF NOT EXISTS idx_product_price_history_tenant_id_fk ON public.product_price_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_deletion_log_deleted_by_fk ON public.order_deletion_log (deleted_by);
CREATE INDEX IF NOT EXISTS idx_waseet_region_review_b_id_fk ON public.waseet_region_review (b_id);
CREATE INDEX IF NOT EXISTS idx_product_attribute_values_attribute_def_id_fk ON public.product_attribute_values (attribute_def_id);
CREATE INDEX IF NOT EXISTS idx_product_activity_log_tenant_id_fk ON public.product_activity_log (tenant_id);
CREATE INDEX IF NOT EXISTS idx_shipping_export_log_exported_by_fk ON public.shipping_export_log (exported_by);
CREATE INDEX IF NOT EXISTS idx_print_batches_tenant_id_fk ON public.print_batches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_current_tenant_id_fk ON public.user_profiles (current_tenant_id);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id_fk ON public.categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_product_options_tenant_id_fk ON public.product_options (tenant_id);
CREATE INDEX IF NOT EXISTS idx_store_config_versions_created_by_fk ON public.store_config_versions (created_by);
CREATE INDEX IF NOT EXISTS idx_waseet_api_logs_tenant_id_fk ON public.waseet_api_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id_fk ON public.chat_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_reply_to_id_fk ON public.chat_messages (reply_to_id);
CREATE INDEX IF NOT EXISTS idx_till_sessions_cashier_id_fk ON public.till_sessions (cashier_id);
CREATE INDEX IF NOT EXISTS idx_till_sessions_opened_by_fk ON public.till_sessions (opened_by);
CREATE INDEX IF NOT EXISTS idx_till_sessions_shop_id_fk ON public.till_sessions (shop_id);
CREATE INDEX IF NOT EXISTS idx_after_sale_adjustments_tenant_id_fk ON public.after_sale_adjustments (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_members_invited_by_fk ON public.tenant_members (invited_by);
CREATE INDEX IF NOT EXISTS idx_notification_settings_tenant_id_fk ON public.notification_settings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_support_saved_replies_created_by_fk ON public.support_saved_replies (created_by);
CREATE INDEX IF NOT EXISTS idx_support_saved_replies_updated_by_fk ON public.support_saved_replies (updated_by);
CREATE INDEX IF NOT EXISTS idx_team_invites_invited_by_fk ON public.team_invites (invited_by);
CREATE INDEX IF NOT EXISTS idx_team_invites_accepted_user_id_fk ON public.team_invites (accepted_user_id);
CREATE INDEX IF NOT EXISTS idx_chat_push_subscriptions_tenant_id_fk ON public.chat_push_subscriptions (tenant_id);
CREATE INDEX IF NOT EXISTS idx_shop_staff_user_id_fk ON public.shop_staff (user_id);
CREATE INDEX IF NOT EXISTS idx_till_pins_user_id_fk ON public.till_pins (user_id);
CREATE INDEX IF NOT EXISTS idx_access_requests_reviewed_by_fk ON public.access_requests (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_admin_users_created_by_fk ON public.admin_users (created_by);
CREATE INDEX IF NOT EXISTS idx_prime_link_requests_linked_by_fk ON public.prime_link_requests (linked_by);
CREATE INDEX IF NOT EXISTS idx_prime_link_requests_requested_by_fk ON public.prime_link_requests (requested_by);
CREATE INDEX IF NOT EXISTS idx_product_order_bumps_tenant_id_fk ON public.product_order_bumps (tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_order_bumps_bump_product_id_fk ON public.product_order_bumps (bump_product_id);
CREATE INDEX IF NOT EXISTS idx_till_events_session_id_fk ON public.till_events (session_id);
CREATE INDEX IF NOT EXISTS idx_till_events_approved_by_fk ON public.till_events (approved_by);
CREATE INDEX IF NOT EXISTS idx_till_events_order_id_fk ON public.till_events (order_id);
CREATE INDEX IF NOT EXISTS idx_till_events_cashier_id_fk ON public.till_events (cashier_id);
CREATE INDEX IF NOT EXISTS idx_account_link_tokens_target_user_id_fk ON public.account_link_tokens (target_user_id);
CREATE INDEX IF NOT EXISTS idx_account_link_tokens_created_by_fk ON public.account_link_tokens (created_by);
CREATE INDEX IF NOT EXISTS idx_account_link_tokens_tenant_id_fk ON public.account_link_tokens (tenant_id);
CREATE INDEX IF NOT EXISTS idx_admin_commission_config_created_by_fk ON public.admin_commission_config (created_by);
CREATE INDEX IF NOT EXISTS idx_admin_employee_commissions_lead_id_fk ON public.admin_employee_commissions (lead_id);
CREATE INDEX IF NOT EXISTS idx_admin_employee_commissions_commission_config_id_fk ON public.admin_employee_commissions (commission_config_id);
CREATE INDEX IF NOT EXISTS idx_admin_employee_commissions_paid_by_fk ON public.admin_employee_commissions (paid_by);
CREATE INDEX IF NOT EXISTS idx_announcements_tenant_id_fk ON public.announcements (tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_created_by_fk ON public.chat_conversations (created_by);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_resolved_by_fk ON public.chat_conversations (resolved_by);
CREATE INDEX IF NOT EXISTS idx_chat_message_reactions_user_id_fk ON public.chat_message_reactions (user_id);
CREATE INDEX IF NOT EXISTS idx_chat_notification_prefs_tenant_id_fk ON public.chat_notification_prefs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_chat_pins_message_id_fk ON public.chat_pins (message_id);
CREATE INDEX IF NOT EXISTS idx_chat_pins_pinned_by_fk ON public.chat_pins (pinned_by);
CREATE INDEX IF NOT EXISTS idx_chat_user_status_tenant_id_fk ON public.chat_user_status (tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_filter_presets_tenant_id_fk ON public.customer_filter_presets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_notes_created_by_fk ON public.customer_notes (created_by);
CREATE INDEX IF NOT EXISTS idx_customer_whitelist_tenant_id_fk ON public.customer_whitelist (tenant_id);
CREATE INDEX IF NOT EXISTS idx_filter_presets_tenant_id_fk ON public.filter_presets (tenant_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_order_id_fk ON public.follow_up_reminders (order_id);
CREATE INDEX IF NOT EXISTS idx_follow_up_reminders_tenant_id_fk ON public.follow_up_reminders (tenant_id);
CREATE INDEX IF NOT EXISTS idx_inventory_alerts_product_id_fk ON public.inventory_alerts (product_id);
CREATE INDEX IF NOT EXISTS idx_iraq_location_reviews_b_location_id_fk ON public.iraq_location_reviews (b_location_id);
CREATE INDEX IF NOT EXISTS idx_lead_activities_created_by_fk ON public.lead_activities (created_by);
CREATE INDEX IF NOT EXISTS idx_lead_follow_ups_completed_by_fk ON public.lead_follow_ups (completed_by);
CREATE INDEX IF NOT EXISTS idx_leads_created_by_fk ON public.leads (created_by);
CREATE INDEX IF NOT EXISTS idx_message_templates_tenant_id_fk ON public.message_templates (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_mutes_tenant_id_fk ON public.notification_mutes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notification_prefs_tenant_id_fk ON public.notification_prefs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_order_payments_created_by_fk ON public.order_payments (created_by);
CREATE INDEX IF NOT EXISTS idx_order_tags_created_by_fk ON public.order_tags (created_by);
CREATE INDEX IF NOT EXISTS idx_payroll_records_paid_by_fk ON public.payroll_records (paid_by);
CREATE INDEX IF NOT EXISTS idx_performance_bonuses_payroll_id_fk ON public.performance_bonuses (payroll_id);
CREATE INDEX IF NOT EXISTS idx_performance_bonuses_tenant_id_fk ON public.performance_bonuses (tenant_id);
CREATE INDEX IF NOT EXISTS idx_performance_bonuses_created_by_fk ON public.performance_bonuses (created_by);
CREATE INDEX IF NOT EXISTS idx_product_batches_variant_id_fk ON public.product_batches (variant_id);
CREATE INDEX IF NOT EXISTS idx_product_batches_tenant_id_fk ON public.product_batches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_bundle_items_tenant_id_fk ON public.product_bundle_items (tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_bundle_items_child_product_id_fk ON public.product_bundle_items (child_product_id);
CREATE INDEX IF NOT EXISTS idx_product_related_tenant_id_fk ON public.product_related (tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_related_related_product_id_fk ON public.product_related (related_product_id);
CREATE INDEX IF NOT EXISTS idx_product_storage_variant_id_fk ON public.product_storage (variant_id);
CREATE INDEX IF NOT EXISTS idx_product_storage_tenant_id_fk ON public.product_storage (tenant_id);
CREATE INDEX IF NOT EXISTS idx_product_tiered_pricing_tenant_id_fk ON public.product_tiered_pricing (tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_items_variant_id_fk ON public.purchase_order_items (variant_id);
CREATE INDEX IF NOT EXISTS idx_purchase_order_receipts_item_id_fk ON public.purchase_order_receipts (item_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_created_by_fk ON public.salary_advances (created_by);
CREATE INDEX IF NOT EXISTS idx_salary_advances_payroll_id_fk ON public.salary_advances (payroll_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_tenant_id_fk ON public.salary_advances (tenant_id);
CREATE INDEX IF NOT EXISTS idx_salary_config_history_changed_by_fk ON public.salary_config_history (changed_by);
CREATE INDEX IF NOT EXISTS idx_salary_config_history_tenant_id_fk ON public.salary_config_history (tenant_id);
CREATE INDEX IF NOT EXISTS idx_salary_penalties_payroll_id_fk ON public.salary_penalties (payroll_id);
CREATE INDEX IF NOT EXISTS idx_salary_penalties_tenant_id_fk ON public.salary_penalties (tenant_id);
CREATE INDEX IF NOT EXISTS idx_salary_penalties_created_by_fk ON public.salary_penalties (created_by);
CREATE INDEX IF NOT EXISTS idx_settings_tenant_id_fk ON public.settings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_smart_collections_tenant_id_fk ON public.smart_collections (tenant_id);
CREATE INDEX IF NOT EXISTS idx_stock_take_items_variant_id_fk ON public.stock_take_items (variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_take_items_location_id_fk ON public.stock_take_items (location_id);
CREATE INDEX IF NOT EXISTS idx_storage_locations_tenant_id_fk ON public.storage_locations (tenant_id);
CREATE INDEX IF NOT EXISTS idx_storage_locations_parent_id_fk ON public.storage_locations (parent_id);
CREATE INDEX IF NOT EXISTS idx_store_config_schedules_created_by_fk ON public.store_config_schedules (created_by);
CREATE INDEX IF NOT EXISTS idx_store_visual_baselines_config_version_id_fk ON public.store_visual_baselines (config_version_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_case_id_tenant_id_fk ON public.support_messages (case_id, tenant_id);
CREATE INDEX IF NOT EXISTS idx_team_goals_created_by_fk ON public.team_goals (created_by);
CREATE INDEX IF NOT EXISTS idx_team_goals_employee_id_fk ON public.team_goals (employee_id);
CREATE INDEX IF NOT EXISTS idx_telegram_link_codes_created_by_fk ON public.telegram_link_codes (created_by);
CREATE INDEX IF NOT EXISTS idx_telegram_pending_orders_user_profile_id_fk ON public.telegram_pending_orders (user_profile_id);
CREATE INDEX IF NOT EXISTS idx_telegram_pending_orders_confirmed_order_id_fk ON public.telegram_pending_orders (confirmed_order_id);
CREATE INDEX IF NOT EXISTS idx_till_approvals_manager_id_fk ON public.till_approvals (manager_id);
CREATE INDEX IF NOT EXISTS idx_till_approvals_tenant_id_fk ON public.till_approvals (tenant_id);
CREATE INDEX IF NOT EXISTS idx_till_clock_shop_id_fk ON public.till_clock (shop_id);
CREATE INDEX IF NOT EXISTS idx_till_clock_user_id_fk ON public.till_clock (user_id);
CREATE INDEX IF NOT EXISTS idx_till_holds_ended_by_fk ON public.till_holds (ended_by);
CREATE INDEX IF NOT EXISTS idx_till_holds_shop_id_fk ON public.till_holds (shop_id);
CREATE INDEX IF NOT EXISTS idx_till_holds_product_id_fk ON public.till_holds (product_id);
CREATE INDEX IF NOT EXISTS idx_till_holds_variant_id_fk ON public.till_holds (variant_id);
CREATE INDEX IF NOT EXISTS idx_till_holds_held_by_fk ON public.till_holds (held_by);
CREATE INDEX IF NOT EXISTS idx_till_testers_product_id_fk ON public.till_testers (product_id);
CREATE INDEX IF NOT EXISTS idx_till_testers_approved_by_fk ON public.till_testers (approved_by);
CREATE INDEX IF NOT EXISTS idx_till_testers_ended_by_fk ON public.till_testers (ended_by);
CREATE INDEX IF NOT EXISTS idx_till_testers_shop_id_fk ON public.till_testers (shop_id);
CREATE INDEX IF NOT EXISTS idx_till_testers_opened_by_fk ON public.till_testers (opened_by);
CREATE INDEX IF NOT EXISTS idx_till_testers_variant_id_fk ON public.till_testers (variant_id);
CREATE INDEX IF NOT EXISTS idx_waseet_city_mappings_tenant_id_fk ON public.waseet_city_mappings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outreach_templates_created_by_fk ON public.whatsapp_outreach_templates (created_by);

-- 3. Duplicate index -------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_iraq_district_areas_key;