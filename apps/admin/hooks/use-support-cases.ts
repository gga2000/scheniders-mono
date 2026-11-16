"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CaseAction,
  ScoreboardDays,
  SupportCaseDetailResponse,
  SupportCasesResponse,
  SupportScoreboard,
} from "@/lib/support";
import type { ShopCheck } from "@/lib/support-shop-check";

async function readJson<T>(res: Response): Promise<T> {
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : "Request failed";
    throw new Error(message);
  }
  return body as T;
}

/** The inbox list. Polls so a new merchant message shows up without a reload. */
export function useSupportCases(view: "open" | "solved") {
  return useQuery<SupportCasesResponse>({
    queryKey: ["admin", "support", "cases", view],
    queryFn: async () => readJson<SupportCasesResponse>(await fetch(`/api/support/cases?view=${view}`)),
    refetchInterval: 10_000,
  });
}

/** How many merchants are waiting on us — the sidebar badge. */
export function useSupportWaitingCount() {
  return useQuery<number>({
    queryKey: ["admin", "support", "waiting-count"],
    queryFn: async () =>
      (await readJson<{ waitingOnUs: number }>(await fetch("/api/support/cases?view=count"))).waitingOnUs,
    refetchInterval: 30_000,
  });
}

/** One conversation with its messages and shop card. Polls while it is open. */
export function useSupportCase(caseId: string | null) {
  return useQuery<SupportCaseDetailResponse>({
    queryKey: ["admin", "support", "case", caseId],
    queryFn: async () => readJson<SupportCaseDetailResponse>(await fetch(`/api/support/cases/${caseId}`)),
    enabled: caseId !== null,
    refetchInterval: 5_000,
  });
}

export function useSupportCaseAction(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: CaseAction) =>
      readJson<{ success: true }>(
        await fetch(`/api/support/cases/${caseId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "support"] }),
  });
}

/** The team scoreboard for the last 7 or 30 days. */
export function useSupportScoreboard(days: ScoreboardDays) {
  return useQuery<SupportScoreboard>({
    queryKey: ["admin", "support", "scoreboard", days],
    queryFn: async () => readJson<SupportScoreboard>(await fetch(`/api/support/scoreboard?days=${days}`)),
    refetchInterval: 60_000,
  });
}

/** "Check this shop": runs only when staff press the button, then on demand. */
export function useSupportShopCheck(caseId: string, enabled: boolean) {
  return useQuery<{ tenantId: string; check: ShopCheck }>({
    queryKey: ["admin", "support", "shop-check", caseId],
    queryFn: async () =>
      readJson<{ tenantId: string; check: ShopCheck }>(await fetch(`/api/support/cases/${caseId}/check`)),
    enabled,
    staleTime: 30_000,
  });
}
