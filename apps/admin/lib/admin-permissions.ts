import type { AdminRole, AdminAction } from "@/types/admin";

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
