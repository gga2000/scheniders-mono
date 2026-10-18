-- =============================================
-- TENANT ISOLATION RLS POLICIES
-- Replace existing permissive policies with
-- tenant-scoped ones on all tables.
-- =============================================

-- Helper: is current user a member of the given tenant?
-- (used in WITH CHECK clauses where tenant_id is set by app code)
-- We rely on user_profiles.current_tenant_id being set at login.

-- ---- orders ----
DROP POLICY IF EXISTS "Allow authenticated users to manage orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view orders" ON public.orders;
DROP POLICY IF EXISTS "Users can insert orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete orders" ON public.orders;

CREATE POLICY "Tenant members can access orders"
    ON public.orders FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- products ----
DROP POLICY IF EXISTS "Allow authenticated users to manage products" ON public.products;
DROP POLICY IF EXISTS "Users can manage products" ON public.products;

CREATE POLICY "Tenant members can access products"
    ON public.products FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- product_variants ----
DROP POLICY IF EXISTS "Allow authenticated users to manage product_variants" ON public.product_variants;

CREATE POLICY "Tenant members can access product_variants"
    ON public.product_variants FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- customer_metadata ----
DROP POLICY IF EXISTS "Allow authenticated users to manage customer_metadata" ON public.customer_metadata;

CREATE POLICY "Tenant members can access customer_metadata"
    ON public.customer_metadata FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- customer_notes ----
DROP POLICY IF EXISTS "Allow authenticated users to manage customer_notes" ON public.customer_notes;

CREATE POLICY "Tenant members can access customer_notes"
    ON public.customer_notes FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- customer_tags ----
DROP POLICY IF EXISTS "Allow authenticated users to manage customer_tags" ON public.customer_tags;

CREATE POLICY "Tenant members can access customer_tags"
    ON public.customer_tags FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- customer_tag_assignments ----
DROP POLICY IF EXISTS "Allow authenticated users to manage customer_tag_assignments" ON public.customer_tag_assignments;

CREATE POLICY "Tenant members can access customer_tag_assignments"
    ON public.customer_tag_assignments FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- customer_filter_presets ----
DROP POLICY IF EXISTS "Allow authenticated users to manage customer_filter_presets" ON public.customer_filter_presets;

CREATE POLICY "Tenant members can access customer_filter_presets"
    ON public.customer_filter_presets FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- customer_risk ----
DROP POLICY IF EXISTS "Allow authenticated users to manage customer_risk" ON public.customer_risk;

CREATE POLICY "Tenant members can access customer_risk"
    ON public.customer_risk FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- customer_whitelist ----
DROP POLICY IF EXISTS "Allow authenticated users to manage customer_whitelist" ON public.customer_whitelist;

CREATE POLICY "Tenant members can access customer_whitelist"
    ON public.customer_whitelist FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- blacklist ----
DROP POLICY IF EXISTS "Allow authenticated users to manage blacklist" ON public.blacklist;

CREATE POLICY "Tenant members can access blacklist"
    ON public.blacklist FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- expenses ----
DROP POLICY IF EXISTS "Allow authenticated users to manage expenses" ON public.expenses;
DROP POLICY IF EXISTS "Admins can manage expenses" ON public.expenses;

CREATE POLICY "Tenant members can access expenses"
    ON public.expenses FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- activity_logs ----
DROP POLICY IF EXISTS "Admins can view all activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can create activity logs" ON public.activity_logs;
DROP POLICY IF EXISTS "Users can view own activity logs" ON public.activity_logs;

CREATE POLICY "Tenant members can access activity_logs"
    ON public.activity_logs FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- whatsapp_logs ----
DROP POLICY IF EXISTS "Allow authenticated users to manage whatsapp_logs" ON public.whatsapp_logs;

CREATE POLICY "Tenant members can access whatsapp_logs"
    ON public.whatsapp_logs FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- order_notes ----
DROP POLICY IF EXISTS "Allow authenticated users to manage order_notes" ON public.order_notes;

CREATE POLICY "Tenant members can access order_notes"
    ON public.order_notes FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- order_notifications ----
DROP POLICY IF EXISTS "Allow authenticated users to manage order_notifications" ON public.order_notifications;

CREATE POLICY "Tenant members can access order_notifications"
    ON public.order_notifications FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- order_status_history ----
DROP POLICY IF EXISTS "Allow authenticated users to manage order_status_history" ON public.order_status_history;

CREATE POLICY "Tenant members can access order_status_history"
    ON public.order_status_history FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- follow_up_reminders ----
DROP POLICY IF EXISTS "Allow authenticated users to manage follow_up_reminders" ON public.follow_up_reminders;

CREATE POLICY "Tenant members can access follow_up_reminders"
    ON public.follow_up_reminders FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- print_batches ----
DROP POLICY IF EXISTS "Allow authenticated users to manage print_batches" ON public.print_batches;

CREATE POLICY "Tenant members can access print_batches"
    ON public.print_batches FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- print_history ----
DROP POLICY IF EXISTS "Allow authenticated users to manage print_history" ON public.print_history;

CREATE POLICY "Tenant members can access print_history"
    ON public.print_history FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- filter_presets ----
DROP POLICY IF EXISTS "Allow authenticated users to manage filter_presets" ON public.filter_presets;

CREATE POLICY "Tenant members can access filter_presets"
    ON public.filter_presets FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- checkout_queue ----
DROP POLICY IF EXISTS "Allow authenticated users to manage checkout_queue" ON public.checkout_queue;

CREATE POLICY "Tenant members can access checkout_queue"
    ON public.checkout_queue FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- rejection_reasons ----
DROP POLICY IF EXISTS "Allow authenticated users to manage rejection_reasons" ON public.rejection_reasons;

CREATE POLICY "Tenant members can access rejection_reasons"
    ON public.rejection_reasons FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- message_templates ----
DROP POLICY IF EXISTS "Allow authenticated users to manage message_templates" ON public.message_templates;

CREATE POLICY "Tenant members can access message_templates"
    ON public.message_templates FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- qc_quarantine ----
DROP POLICY IF EXISTS "Allow authenticated users to manage qc_quarantine" ON public.qc_quarantine;

CREATE POLICY "Tenant members can access qc_quarantine"
    ON public.qc_quarantine FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- delivery_imports ----
DROP POLICY IF EXISTS "Allow authenticated users to manage delivery_imports" ON public.delivery_imports;

CREATE POLICY "Tenant members can access delivery_imports"
    ON public.delivery_imports FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- delivery_import_items ----
DROP POLICY IF EXISTS "Allow authenticated users to manage delivery_import_items" ON public.delivery_import_items;

CREATE POLICY "Tenant members can access delivery_import_items"
    ON public.delivery_import_items FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- waseet_city_mappings ----
DROP POLICY IF EXISTS "Allow authenticated users to manage waseet_city_mappings" ON public.waseet_city_mappings;

CREATE POLICY "Tenant members can access waseet_city_mappings"
    ON public.waseet_city_mappings FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- waseet_api_logs ----
DROP POLICY IF EXISTS "Allow authenticated users to manage waseet_api_logs" ON public.waseet_api_logs;

CREATE POLICY "Tenant members can access waseet_api_logs"
    ON public.waseet_api_logs FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- announcements ----
DROP POLICY IF EXISTS "Allow authenticated users to manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "Admins can manage announcements" ON public.announcements;
DROP POLICY IF EXISTS "All authenticated users can view announcements" ON public.announcements;

CREATE POLICY "Tenant members can access announcements"
    ON public.announcements FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- settings ----
DROP POLICY IF EXISTS "Allow authenticated users to manage settings" ON public.settings;
DROP POLICY IF EXISTS "Admins can manage settings" ON public.settings;

CREATE POLICY "Tenant members can access settings"
    ON public.settings FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active'
        )
    );

-- ---- salary tables ----
DROP POLICY IF EXISTS "Admins can manage payroll_records" ON public.payroll_records;
CREATE POLICY "Tenant admin members can manage payroll_records"
    ON public.payroll_records FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can manage salary_advances" ON public.salary_advances;
CREATE POLICY "Tenant admin members can manage salary_advances"
    ON public.salary_advances FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can manage salary_penalties" ON public.salary_penalties;
CREATE POLICY "Tenant admin members can manage salary_penalties"
    ON public.salary_penalties FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can manage performance_bonuses" ON public.performance_bonuses;
CREATE POLICY "Tenant admin members can manage performance_bonuses"
    ON public.performance_bonuses FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can manage employee_salary_configs" ON public.employee_salary_configs;
CREATE POLICY "Tenant admin members can manage employee_salary_configs"
    ON public.employee_salary_configs FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins manage salary config history" ON public.salary_config_history;
CREATE POLICY "Tenant admin members can manage salary_config_history"
    ON public.salary_config_history FOR ALL
    USING (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
        )
    )
    WITH CHECK (
        tenant_id IN (
            SELECT tenant_id FROM public.tenant_members
            WHERE user_id = auth.uid() AND status = 'active' AND role = 'admin'
        )
    );

DROP POLICY IF EXISTS "Admins can manage role_salary_defaults" ON public.role_salary_defaults;
CREATE POLICY "Tenant admin members can manage role_salary_defaults"
    ON public.role_salary_defaults FOR ALL
    USING (auth.uid() IS NOT NULL);  -- global table, all authenticated admins
;
