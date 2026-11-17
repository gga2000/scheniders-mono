"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { okOrLoadFailure } from "@/lib/load-failure";

/** How many of the newest staff steps the bell lists. */
export const RECENT_STEPS = 20;

const RecentStepsSchema = z.object({
  logs: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      // A step's details are free JSON; anything but an object reads as none.
      details: z.record(z.string(), z.unknown()).nullable().catch(null),
      tenant_id: z.string().nullable(),
      created_at: z.string(),
    }),
  ),
});

export type RecentStep = z.infer<typeof RecentStepsSchema>["logs"][number];

/**
 * The newest staff steps, read for the bell on every page. The bell used to
 * borrow Home's data, so on any page opened before Home it said "No
 * notifications yet" over a full log.
 */
export async function readRecentSteps(fetcher: typeof fetch = fetch): Promise<RecentStep[]> {
  const res = okOrLoadFailure(await fetcher(`/api/activity?limit=${RECENT_STEPS}`), "recent steps");
  return RecentStepsSchema.parse(await res.json()).logs;
}

export function useRecentSteps() {
  return useQuery<RecentStep[]>({
    // Under ["admin", "activity"], so a new staff step refreshes it with the Activity page.
    queryKey: ["admin", "activity", "bell"],
    queryFn: () => readRecentSteps(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}
