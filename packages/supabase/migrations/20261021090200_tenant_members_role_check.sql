-- tenant_members.role is 'admin' or 'member' (margin/tenancy gaps, 2026-10-21).
--
-- WHY
-- The column had no CHECK. Every reader treats it as two-valued:
-- is_tenant_admin() tests role = 'admin', requireTenantAdmin* the same, and
-- anything else is a plain member. Three service-role writers stored the
-- user_profiles vocabulary instead ('employee', 'viewer'): /api/auth/create-user
-- (default 'employee'), /api/admin/access-requests and team-provisioning (the
-- invite's role). Nothing broke only because "not 'admin'" reads as member.
-- Those routes now map the profile role to the membership role
-- (apps/platform/lib/tenant-member-role.ts); this pins the column so a new
-- writer cannot drift again.
--
-- PREREQUISITE
-- Live 2026-10-21: 19 'admin' rows and 4 'member' rows, nothing else. Deploy
-- the route fix BEFORE applying this, or a create-user / invite acceptance in
-- between fails on the constraint. The check below stops the migration rather
-- than rewriting any row it does not expect.

DO $$
DECLARE
    v_bad integer;
BEGIN
    SELECT count(*) INTO v_bad
      FROM public.tenant_members
     WHERE role IS NULL OR role NOT IN ('admin', 'member');
    IF v_bad > 0 THEN
        RAISE EXCEPTION 'tenant_members has % row(s) with a role other than admin/member; map them before adding the CHECK', v_bad
            USING HINT = 'SELECT role, count(*) FROM public.tenant_members GROUP BY 1;';
    END IF;
END;
$$;

ALTER TABLE public.tenant_members
    ADD CONSTRAINT tenant_members_role_check CHECK (role IN ('admin', 'member'));
