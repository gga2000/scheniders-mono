import { isTenantRole, type TenantRole } from "@/lib/permissions";

/**
 * `tenant_members.role` uses the role_permissions vocabulary: 'admin',
 * 'employee' or 'viewer' (CHECK tenant_members_role_check, migration
 * 20261020215422, SEC-30). resolveEffectiveRole treats any other value as no
 * role at all, and the CHECK rejects it.
 *
 * The team routes take a profile role, which can also be the platform's
 * 'super_admin' or empty. This is the one mapping from it to a membership role:
 * a tenant role passes through, and anything else becomes the least-privileged
 * working role, 'employee'. Platform staff are never minted a store role here.
 */
export type TenantMemberRole = TenantRole;

export function tenantMemberRoleFor(profileRole: string): TenantMemberRole {
    return isTenantRole(profileRole) ? profileRole : "employee";
}
