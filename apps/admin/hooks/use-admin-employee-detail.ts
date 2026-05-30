"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminEmployee, AdminEmployeeTracking, EmployeeCommission } from "@/types/leads";
import { adminFetch } from "@/lib/admin-fetch";

interface EmployeeDetailResponse {
  employee: AdminEmployee;
  recent_actions: AdminEmployeeTracking[];
  commissions: EmployeeCommission[];
  achievements: string[];
}

export function useAdminEmployeeDetail(id: string | null) {
  return useQuery<EmployeeDetailResponse>({
    queryKey: ["admin-employee", id],
    queryFn: async () => {
      const res = await adminFetch(`/api/team/${id}`);
      if (!res.ok) throw new Error("Failed to fetch employee");
      return res.json();
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useEmployeeActions(id: string | null, page = 1) {
  return useQuery<{ actions: AdminEmployeeTracking[]; total: number }>({
    queryKey: ["admin-employee-actions", id, page],
    queryFn: async () => {
      const res = await adminFetch(`/api/team/${id}/actions?page=${page}&limit=50`);
      if (!res.ok) throw new Error("Failed to fetch actions");
      return res.json();
    },
    enabled: !!id,
    staleTime: 15_000,
  });
}
