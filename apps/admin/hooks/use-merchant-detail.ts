"use client";

import { useQuery } from "@tanstack/react-query";

export interface MerchantDetail {
  tenant: {
    id: string;
    business_name: string;
    slug: string;
    plan: string;
    status: string;
    trial_ends_at: string | null;
    branding: { logo_url: string | null; primary_color: string; secondary_color: string } | null;
    settings: Record<string, unknown> | null;
    store_config: Record<string, unknown> | null;
    contact_email: string | null;
    contact_phone: string | null;
    address: string | null;
    city: string | null;
    created_at: string;
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
