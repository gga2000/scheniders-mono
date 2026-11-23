"use client";

import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { adminFetch } from "@/lib/admin-fetch";
import { okOrLoadFailure, pollEvery } from "@/lib/load-failure";
import { SHELL_READ, useAfterPageReads } from "@/hooks/use-after-page-reads";

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
      /** The shop the step was about, by name: what the bell shows under the step. */
      business_name: z.string().nullable().catch(null),
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
export async function readRecentSteps(
  fetcher: (input: string) => Promise<Response> = adminFetch,
): Promise<RecentStep[]> {
  // count=none: the bell shows no total, so the server need not count the whole log.
  const res = okOrLoadFailure(await fetcher(`/api/activity?limit=${RECENT_STEPS}&count=none`), "recent steps");
  return RecentStepsSchema.parse(await res.json()).logs;
}

export function useRecentSteps() {
  return useQuery<RecentStep[]>({
    // Under ["admin", "activity"], so a new staff step refreshes it with the Activity page.
    queryKey: ["admin", "activity", "bell"],
    meta: SHELL_READ,
    enabled: useAfterPageReads(),
    queryFn: () => readRecentSteps(),
    staleTime: 30_000,
    refetchInterval: pollEvery(60_000),
  });
}
