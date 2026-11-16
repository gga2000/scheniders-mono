export type AdminRole = "super_admin" | "support_staff";

/** The one paid plan, plus "internal" for our own shops (never billed). */
export const PLAN_TIERS = ["starter", "internal"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];
export const PLAN_LABELS: Readonly<Record<PlanTier, string>> = {
  starter: "Starter",
  internal: "Internal (no billing)",
};
export type TenantStatus = "trial" | "active" | "limited" | "suspended" | "cancelled";

export interface TenantRestrictions {
  paused_until?: string | null;
  paused_at?: string | null;
  paused_by?: string | null;
  reason?: string | null;
  /** The status the pause replaced, kept by the database so lifting the pause can give it back. */
  status_before?: string | null;
  blocks?: {
    new_orders?: boolean;
    new_products?: boolean;
    team_invites?: boolean;
    storefront_writes?: boolean;
  };
}

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  full_name: string | null;
  avatar_url: string | null;
}

/** What each part adds to, or takes from, 50 in a shop's health score. */
export interface HealthParts {
  status: number;
  wallet: number;
  orders: number;
}

export type AdminAction =
  | "top_up_wallet"
  | "adjust_balance"
  | "change_plan"
  | "extend_trial"
  | "suspend_tenant"
  | "reactivate_tenant"
  | "add_note"
  | "export_data"
  | "update_settings"
  | "manage_subscription"
  | "manage_commissions"
  | "convert_lead"
  | "delete_leads"
  | "link_prime"
  | "handle_support"
  | "pause_whatsapp"
  | "check_payments"
  | "manage_demo_store"
  | "manage_admins"
  | "review_trials";
