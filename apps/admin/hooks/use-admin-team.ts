"use client";

import { useQuery } from "@tanstack/react-query";
import type { AdminEmployee } from "@/types/leads";

export function useAdminTeam() {
  return useQuery<AdminEmployee[]>({
    queryKey: ["admin-team"],
    queryFn: async () => {
      const res = await fetch("/api/team");
      if (!res.ok) throw new Error("Failed to fetch team");
      const data = await res.json();
      return data.employees;
    },
    staleTime: 30_000,
  });
}
