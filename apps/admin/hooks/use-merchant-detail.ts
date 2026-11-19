"use client";

import { useQuery } from "@tanstack/react-query";
import { okOrLoadFailure } from "@/lib/load-failure";
import type { HealthParts, TenantRestrictions } from "@/types/admin";
import type { BillingLockSnapshot } from "@/lib/billing-lock-tools";
import { adminFetch } from "@/lib/admin-fetch";

export interface PlanLimits {
  plan: string;
  max_orders_per_month: number;
  max_team_members: number;
  base_price_iqd: number;
  order_price_iqd: number;
  overage_price_iqd: number;
  features: Record<string, boolean>;
}

export interface MerchantDetail {
  tenant: {
    id: string;
    /** The shop number staff and merchants quote, as in "#100095". */
    display_id: number | null;
    business_name: string;
    slug: string;
    plan: string;
    status: string;
    trial_ends_at: string | null;
    branding: {
      logo_url: string | null;
      primary_color: string;
      secondary_color: string;
    } | null;
    settings: Record<string, unknown> | null;
    /** How many times the store builder was published (raised only by a publish). */
    store_config_rev: number | null;
    contact_email: string | null;
    contact_phone: string | null;
    address: string | null;
    city: string | null;
    created_at: string;
    is_prospect?: boolean;
    /** The demo store (Fermi B13): never charged. */
    is_demo: boolean;
    prospect_lead_id?: string | null;
    restrictions?: TenantRestrictions | null;
    /** 0 to 100, worked out by the database, the same number as in the list. */
    staff_health_score: number;
    staff_health_parts: HealthParts;
  };
  wallet: {
    balance_iqd: number;
    threshold_iqd: number;
    total_charged_iqd: number;
    total_topped_up_iqd: number;
  } | null;
  subscription: {
    plan: string;
    status: string;
    current_period_start: string;
    current_period_end: string;
    pending_plan: string | null;
    plan_change_at: string | null;
    auto_renew?: boolean;
  } | null;
  usage: Array<{
    year: number;
    month: number;
    orders_count: number;
    orders_charged: number;
    team_members_count: number;
  }>;
  team: Array<{
    id: string;
    user_id: string;
    role: string;
    status: string;
    invited_at: string | null;
    /** Empty for a member who was added and has not signed in to the shop yet. */
    joined_at: string | null;
    user_profiles: {
      email: string;
      display_name: string | null;
      avatar_url: string | null;
    } | null;
  }>;
  notes: Array<{
    id: string;
    admin_user_id: string;
    content: string;
    is_pinned: boolean;
    created_at: string;
    updated_at: string;
  }>;
  orderCount: number;
  planLimits: PlanLimits | null;
  /** The billing lock (Fermi A1); null for an unknown store. */
  billingLock: BillingLockSnapshot | null;
  /**
   * The shop's charged plan months, as the Paying page counts them: its first
   * charge and the end of its latest charged month; both null when never charged.
   */
  paidPlan: { first_paid_at: string | null; paid_until: string | null };
  /** Whether the viewing staff member may unlock a store for free. */
  canForceUnlock: boolean;
  /** For a shop on hold or paused: who did it and when, from the staff log; null when the log has no such step. */
  stoppedBy: { who: string; at: string } | null;
}

export interface RecentOrder {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  total_iqd: number;
  status: string;
  created_at: string;
  updated_at: string;
  items_count: number | null;
}

export function useMerchantDetail(id: string) {
  return useQuery<MerchantDetail>({
    queryKey: ["admin", "merchant", id],
    queryFn: async () => {
      const res = okOrLoadFailure(await adminFetch(`/api/merchants/${id}`), "this shop");
      return res.json();
    },
    staleTime: 30_000,
    enabled: !!id,
  });
}

export function useMerchantRecentOrders(id: string, limit = 10) {
  return useQuery<{ orders: RecentOrder[] }>({
    queryKey: ["admin", "merchant", id, "recent-orders", limit],
    queryFn: async () => {
      const res = await adminFetch(`/api/merchants/${id}/orders?limit=${limit}`);
      okOrLoadFailure(res, "recent orders");
      return res.json();
    },
    staleTime: 30_000,
    enabled: !!id,
  });
}
