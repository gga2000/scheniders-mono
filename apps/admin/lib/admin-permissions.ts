import type { AdminRole, AdminAction } from "@/types/admin";

/**
 * The single source of truth for what each admin-console role may do. API
 * routes enforce it through `requireAdminPermission` (lib/api-auth.ts); the
 * middleware only checks "is an active admin", so any mutation that is not
 * open to every admin must name its action here.
 *
 *   manage_subscription — extend a paid subscription / convert a trial to
 *                         paid (grants paid time without a payment).
 *   manage_commissions  — edit commission configs / recalculate payouts.
 *   convert_lead        — turn a sales lead into a live merchant on the
 *                         starter plan (30-day subscription row, 14-day trial
 *                         clock). Open to support_staff on purpose: closing a
 *                         lead is the sales team's job and it is what earns
 *                         their commission. The plan is not caller-chosen;
 *                         upgrading afterwards is `change_plan`.
 *   delete_leads        — delete sales leads, one or in bulk. Super admins
 *                         only: a deleted lead takes its history with it.
 *   update_settings     — also covers the industry list leads are sorted by.
 *   link_prime          — approve a shop's Prime link (the shop's own check
 *                         found the account; another shop uses it, or a Prime
 *                         shop must be picked), which tells the shop. Open to
 *                         support_staff: linking couriers is day-to-day
 *                         onboarding work.
 *   handle_support      — read merchant support conversations, reply, take
 *                         ownership and mark them solved. Open to both roles:
 *                         answering merchants is the support team's job.
 *   pause_whatsapp      — pause or resume one shop's automatic WhatsApp
 *                         messages. Super admins only: every shop sends from
 *                         one number, and resuming a shop whose messages
 *                         mostly fail risks that number for all of them.
 *   check_payments      — approve or refuse a shop's transfer receipt (Fermi
 *                         B3): approving adds what really arrived to the
 *                         shop's wallet, refusing tells the shop why. Open to
 *                         support_staff on purpose: the handoff gives transfers
 *                         to Karrar (Mohammed backs up). Each request credits
 *                         once, under its own key, and every decision is in
 *                         the staff log. A top-up without a receipt stays
 *                         `top_up_wallet`, super admins only.
 *   manage_demo_store   — create the demo store (Fermi B13), reset its data,
 *                         and open it signed in as its owner. Super admins
 *                         only: a reset wipes the store, and the open link
 *                         is a sign-in.
 *   manage_admins       — give or take away a person's console access and
 *                         set their role. Super admins only: a support login
 *                         that could do this could make itself super admin.
 *   review_trials       — act on the one-trial check (Fermi B5): give a
 *                         flagged store its trial back, end a flagged
 *                         store's trial, or mark the row checked, each with a
 *                         reason in the staff log. Open to support_staff on
 *                         purpose: the handoff gives the triage to Mohammed,
 *                         and every step can be undone (giving a trial back
 *                         is the same move as extend_trial).
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
    "export_data",
    "update_settings",
    "manage_subscription",
    "manage_commissions",
    "convert_lead",
    "delete_leads",
    "link_prime",
    "handle_support",
    "pause_whatsapp",
    "check_payments",
    "manage_demo_store",
    "manage_admins",
    "review_trials",
  ]),
  support_staff: new Set([
    "extend_trial",
    "add_note",
    "export_data",
    "convert_lead",
    "link_prime",
    "handle_support",
    "check_payments",
    "review_trials",
  ]),
};

export function hasPermission(role: AdminRole, action: AdminAction): boolean {
  return ROLE_PERMISSIONS[role]?.has(action) ?? false;
}

export function getPermissions(role: AdminRole): AdminAction[] {
  return Array.from(ROLE_PERMISSIONS[role] ?? []);
}
