"use client";

import { useQuery } from "@tanstack/react-query";
import { okOrLoadFailure } from "@/lib/load-failure";
import { adminFetch } from "@/lib/admin-fetch";

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
      const res = await adminFetch("/api/admin-users");
      okOrLoadFailure(res, "admin users");
      const data = await res.json();
      return data.users ?? [];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
