export type AdminRole = "super_admin" | "support_staff";

export type PlanTier = "starter" | "growth" | "professional" | "enterprise";
export type TenantStatus = "trial" | "active" | "suspended" | "cancelled";

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  full_name: string | null;
  avatar_url: string | null;
}

export interface AdminTenant {
  id: string;
  business_name: string;
  slug: string;
  plan: PlanTier;
  status: TenantStatus;
  trial_ends_at: string | null;
  branding: {
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
  };
  settings: {
    timezone: string;
    language: string;
    currency: string;
  };
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  city: string | null;
  created_at: string;
  // Joined data
  subscription?: {
    plan: PlanTier;
    status: string;
    current_period_start: string;
    current_period_end: string;
    pending_plan: PlanTier | null;
  };
  wallet?: {
    balance_iqd: number;
    threshold_iqd: number;
    total_charged_iqd: number;
    total_topped_up_iqd: number;
  };
  usage?: {
    orders_count: number;
    orders_charged: number;
    team_members_count: number;
  };
}

export interface AdminNote {
  id: string;
  tenant_id: string;
  admin_user_id: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  admin_user?: { full_name: string | null; email: string };
}

export interface AdminActivityLog {
  id: string;
  admin_user_id: string;
  tenant_id: string | null;
  action: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  admin_user?: { full_name: string | null; email: string };
  tenant?: { business_name: string; slug: string };
}

export type AdminAction =
  | "top_up_wallet"
  | "adjust_balance"
  | "change_plan"
  | "extend_trial"
  | "suspend_tenant"
  | "reactivate_tenant"
  | "add_note"
  | "send_notification"
  | "impersonate"
  | "bulk_action"
  | "export_data"
  | "update_settings";

export const ADMIN_PERMISSIONS: Record<AdminRole, AdminAction[]> = {
  super_admin: [
    "top_up_wallet", "adjust_balance", "change_plan", "extend_trial",
    "suspend_tenant", "reactivate_tenant", "add_note", "send_notification",
    "impersonate", "bulk_action", "export_data", "update_settings",
  ],
  support_staff: [
    "extend_trial", "add_note", "send_notification", "impersonate", "export_data",
  ],
};
