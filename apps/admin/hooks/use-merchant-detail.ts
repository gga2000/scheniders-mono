"use client";

import { useQuery } from "@tanstack/react-query";
import type { TenantRestrictions } from "@/types/admin";

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
    store_config: Record<string, unknown> | null;
    contact_email: string | null;
    contact_phone: string | null;
    address: string | null;
    city: string | null;
    created_at: string;
    is_prospect?: boolean;
    prospect_lead_id?: string | null;
    restrictions?: TenantRestrictions | null;
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
  transactions: Array<{
    id: string;
    type: string;
    amount_iqd: number;
    balance_after_iqd: number;
    description: string | null;
    reference_id: string | null;
    created_at: string;
  }>;
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
    joined_at: string;
    user_profiles: {
      email: string;
      full_name: string | null;
      phone: string | null;
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
      const res = await fetch(`/api/merchants/${id}`);
      if (!res.ok) throw new Error("Failed to fetch merchant");
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
      const res = await fetch(`/api/merchants/${id}/orders?limit=${limit}`);
      if (!res.ok) throw new Error("Failed to fetch recent orders");
      return res.json();
    },
    staleTime: 30_000,
    enabled: !!id,
  });
}
