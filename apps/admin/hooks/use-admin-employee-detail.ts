"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminEmployee, StaffAction, EmployeeCommission } from "@/types/leads";
import { adminFetch } from "@/lib/admin-fetch";
import { okOrLoadFailure } from "@/lib/load-failure";

interface EmployeeDetailResponse {
  employee: AdminEmployee;
  recent_actions: StaffAction[];
  commissions: EmployeeCommission[];
  achievements: string[];
}

export function useAdminEmployeeDetail(id: string | null) {
  return useQuery<EmployeeDetailResponse>({
    queryKey: ["admin-employee", id],
    queryFn: async () => {
      const res = await adminFetch(`/api/team/${id}`);
      okOrLoadFailure(res, "employee");
      return res.json();
    },
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useEmployeeActions(id: string | null, page = 1) {
  return useQuery<{ actions: StaffAction[]; total: number }>({
    queryKey: ["admin-employee-actions", id, page],
    queryFn: async () => {
      const res = await adminFetch(`/api/team/${id}/actions?page=${page}&limit=50`);
      okOrLoadFailure(res, "actions");
      return res.json();
    },
    enabled: !!id,
    staleTime: 15_000,
  });
}
