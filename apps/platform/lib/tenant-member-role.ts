/**
 * `tenant_members.role` is two-valued: 'admin' or 'member' (CHECK
 * tenant_members_role_check, migration 20261021090200). is_tenant_admin() and
 * every requireTenantAdmin* gate test role = 'admin'; anything else is a plain
 * member.
 *
 * `user_profiles.role` has a wider vocabulary (admin / employee / viewer, plus
 * the platform's super_admin), and the team routes take a role in that
 * vocabulary. This is the one mapping from it to the membership role, so a
 * writer cannot store 'employee' or 'viewer' in tenant_members again.
 */
export type TenantMemberRole = "admin" | "member";

export function tenantMemberRoleFor(profileRole: string): TenantMemberRole {
    return profileRole === "admin" ? "admin" : "member";
}
