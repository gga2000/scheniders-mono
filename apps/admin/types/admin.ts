export type AdminRole = "super_admin" | "support_staff";

export type PlanTier = "starter" | "growth" | "professional" | "enterprise";
export type TenantStatus = "trial" | "active" | "limited" | "suspended" | "cancelled";

export interface TenantRestrictions {
  paused_until?: string | null;
  paused_at?: string | null;
  paused_by?: string | null;
  reason?: string | null;
  blocks?: {
    new_orders?: boolean;
    new_products?: boolean;
    team_invites?: boolean;
    storefront_writes?: boolean;
  };
}

export type TableDensity = "compact" | "comfortable" | "spacious";
export type ViewMode = "cards" | "table" | "sheet" | "map" | "kanban";
export type DetailViewMode = "dialog" | "panel" | "full";

export interface SortConfig {
  column: string;
  direction: "asc" | "desc";
}

export interface SavedView {
  id: string;
  name: string;
  icon?: string;
  filters: {
    planFilter: string | null;
    statusFilter: string | null;
    cityFilter: string | null;
    balanceFilter: string | null;
    healthFilter: string | null;
    searchQuery?: string;
    dateRange?: { from: string | null; to: string | null };
  };
  sort?: SortConfig[];
  columns?: string[];
  isDefault?: boolean;
}

export interface FilterCondition {
  field: string;
  operator: "equals" | "not_equals" | "gt" | "gte" | "lt" | "lte" | "between" | "in" | "not_in" | "contains" | "not_contains" | "before" | "after" | "within_last";
  value: unknown;
  secondValue?: unknown;
}

export interface FilterGroup {
  logic: "and" | "or";
  conditions: FilterCondition[];
}

export interface AdvancedFilters {
  logic: "and" | "or";
  groups: FilterGroup[];
}

export interface AdminUser {
  id: string;
  email: string;
  role: AdminRole;
  full_name: string | null;
  avatar_url: string | null;
}

export interface AdminTenant {
  id: string;
  display_id?: number | null;
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
  // Prospect fields
  is_prospect?: boolean;
  prospect_lead_id?: string | null;
  // Computed fields
  tags: string[];
  last_active_at: string | null;
  monthly_revenue: number;
  daily_revenue: number;
  orders_30d?: number;
  order_sparkline: number[];
  pinned_note?: {
    content: string;
    updated_at: string;
    admin_label: string | null;
  } | null;
  restrictions?: TenantRestrictions | null;
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
  | "update_settings"
  | "manage_subscription"
  | "manage_tags"
  | "manage_commissions";

// Merchant table column definitions
export type MerchantColumnId =
  | "business" | "plan" | "status" | "city" | "balance" | "orders"
  | "health" | "revenue" | "lastActive" | "tags" | "sparkline" | "actions";

export interface MerchantColumn {
  id: MerchantColumnId;
  label: string;
  locked?: boolean;
}

export const MERCHANT_COLUMNS: MerchantColumn[] = [
  { id: "business", label: "Business", locked: true },
  { id: "plan", label: "Plan" },
  { id: "status", label: "Status" },
  { id: "city", label: "City" },
  { id: "balance", label: "Balance" },
  { id: "orders", label: "Orders" },
  { id: "health", label: "Health" },
  { id: "revenue", label: "Revenue" },
  { id: "lastActive", label: "Last Active" },
  { id: "tags", label: "Tags" },
  { id: "sparkline", label: "Trend" },
  { id: "actions", label: "Actions" },
];
