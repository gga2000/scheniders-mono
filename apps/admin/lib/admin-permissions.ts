import type { AdminRole, AdminAction } from "@/types/admin";

/**
 * The single source of truth for what each admin-console role may do. API
 * routes enforce it through `requireAdminPermission` (lib/api-auth.ts); the
 * middleware only checks "is an active admin", so any mutation that is not
 * open to every admin must name its action here.
 *
 *   manage_subscription — extend a paid subscription / convert a trial to
 *                         paid (grants paid time without a payment).
 *   manage_tags         — overwrite a merchant's tags.
 *   manage_commissions  — edit commission configs / recalculate payouts.
 */
const ROLE_PERMISSIONS: Record<AdminRole, Set<AdminAction>> = {
  super_admin: new Set([
    "top_up_wallet",
    "adjust_balance",
    "change_plan",
    "extend_trial",
    "suspend_tenant",
    "reactivate_tenant",
    "add_note",
    "send_notification",
    "impersonate",
    "bulk_action",
    "export_data",
    "update_settings",
    "manage_subscription",
    "manage_tags",
    "manage_commissions",
  ]),
  support_staff: new Set([
    "extend_trial",
    "add_note",
    "send_notification",
    "impersonate",
    "export_data",
  ]),
};

export function hasPermission(role: AdminRole, action: AdminAction): boolean {
  return ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

export function getPermissions(role: AdminRole): AdminAction[] {
  return Array.from(ROLE_PERMISSIONS[role] ?? []);
}
