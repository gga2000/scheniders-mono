-- R8-02: the app treats platform staff (user_profiles.role = 'super_admin') as
-- admins in every store, so the notes rule does too; otherwise the notes card
-- offers Delete to them and the database silently refuses.
ALTER POLICY customer_notes_author_or_admin_updates ON public.customer_notes
    USING (created_by = (SELECT auth.uid())
           OR public.is_tenant_admin(tenant_id)
           OR EXISTS (SELECT 1 FROM public.user_profiles up
                       WHERE up.id = (SELECT auth.uid()) AND up.role = 'super_admin'));

ALTER POLICY customer_notes_author_or_admin_deletes ON public.customer_notes
    USING (created_by = (SELECT auth.uid())
           OR public.is_tenant_admin(tenant_id)
           OR EXISTS (SELECT 1 FROM public.user_profiles up
                       WHERE up.id = (SELECT auth.uid()) AND up.role = 'super_admin'));