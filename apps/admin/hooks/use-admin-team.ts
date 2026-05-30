"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminEmployee } from "@/types/leads";
import { adminFetch } from "@/lib/admin-fetch";

export function useAdminTeam() {
  return useQuery<AdminEmployee[]>({
    queryKey: ["admin-team"],
    queryFn: async () => {
      const res = await adminFetch("/api/team");
      if (!res.ok) throw new Error("Failed to fetch team");
      const data = await res.json();
      return data.employees;
    },
    staleTime: 30_000,
  });
}
