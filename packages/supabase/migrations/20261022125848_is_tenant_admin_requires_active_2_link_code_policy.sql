-- F-087 part 2 of 2: telegram_link_codes writes must target an active member
-- with an active profile. ALTER POLICY keeps the policy's name, command and
-- roles; USING is unchanged.
ALTER POLICY telegram_link_codes_tenant_admin_all ON public.telegram_link_codes
    TO public
    USING (
        (tenant_id = public.get_current_tenant_id())
        AND public.is_tenant_admin(tenant_id)
    )
    WITH CHECK (
        (tenant_id = public.get_current_tenant_id())
        AND public.is_tenant_admin(tenant_id)
        AND EXISTS (
            SELECT 1
              FROM public.tenant_members tm
              JOIN public.user_profiles up ON up.id = tm.user_id
             WHERE tm.tenant_id = telegram_link_codes.tenant_id
               AND tm.user_id = telegram_link_codes.user_profile_id
               AND tm.status = 'active'
               AND coalesce(up.is_active, true)
        )
    );
