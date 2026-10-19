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
 *   convert_lead        — turn a sales lead into a live merchant on the
 *                         starter plan (30-day subscription row, 14-day trial
 *                         clock). Open to support_staff on purpose: closing a
 *                         lead is the sales team's job and it is what earns
 *                         their commission. The plan is not caller-chosen;
 *                         upgrading afterwards is `change_plan`.
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
    "convert_lead",
  ]),
  support_staff: new Set([
    "extend_trial",
    "add_note",
    "send_notification",
    "impersonate",
    "export_data",
    "convert_lead",
  ]),
};

export function hasPermission(role: AdminRole, action: AdminAction): boolean {
  return ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

export function getPermissions(role: AdminRole): AdminAction[] {
  return Array.from(ROLE_PERMISSIONS[role] ?? []);
}
