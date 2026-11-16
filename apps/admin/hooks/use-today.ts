"use client";

import { useQuery } from "@tanstack/react-query";
import type { TodayResponse } from "@/lib/today";
import { okOrLoadFailure } from "@/lib/load-failure";

/**
 * The Today desk: who is waiting and the numbers above the list. Read again
 * every minute and when staff come back to the tab, so a receipt that arrives
 * shows without a reload.
 */
export function useToday() {
  return useQuery<TodayResponse>({
    queryKey: ["admin", "today"],
    queryFn: async () => {
      const res = await fetch("/api/today");
      okOrLoadFailure(res, "who is waiting");
      return res.json();
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
