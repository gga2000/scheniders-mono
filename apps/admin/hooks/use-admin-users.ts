"use client";

import { useQuery } from "@tanstack/react-query";

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
}

export function useAdminUsers() {
  return useQuery<AdminUser[]>({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const res = await fetch("/api/admin-users");
      if (!res.ok) throw new Error("Failed to fetch admin users");
      const data = await res.json();
      return data.users ?? [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
