"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CaseAction,
  NeedsUsShop,
  NoticePostInput,
  ScoreboardDays,
  StartConversation,
  SupportCaseDetailResponse,
  SupportCasesResponse,
  SupportNotice,
  SupportScoreboard,
  SupportTask,
  SupportTeammate,
  TaskLogInput,
} from "@/lib/support";
import type { ShopCheck } from "@/lib/support-shop-check";
import type { SupportSpike } from "@/lib/support-spike";
import { SHELL_READ, useAfterPageReads } from "@/hooks/use-after-page-reads";
import { adminFetch } from "@/lib/admin-fetch";

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
    queryFn: async () => readJson<SupportCasesResponse>(await adminFetch(`/api/support/cases?view=${view}`)),
    refetchInterval: 10_000,
  });
}

/** How many merchants are waiting on us — the sidebar badge. */
export function useSupportWaitingCount() {
  return useQuery<number>({
    queryKey: ["admin", "support", "waiting-count"],
    meta: SHELL_READ,
    enabled: useAfterPageReads(),
    queryFn: async () =>
      (await readJson<{ waitingOnUs: number }>(await adminFetch("/api/support/cases?view=count"))).waitingOnUs,
    refetchInterval: 30_000,
  });
}

/** One conversation with its messages and shop card. Polls while it is open. */
export function useSupportCase(caseId: string | null) {
  return useQuery<SupportCaseDetailResponse>({
    queryKey: ["admin", "support", "case", caseId],
    queryFn: async () => readJson<SupportCaseDetailResponse>(await adminFetch(`/api/support/cases/${caseId}`)),
    enabled: caseId !== null,
    refetchInterval: 5_000,
  });
}

export function useSupportCaseAction(caseId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: CaseAction) =>
      readJson<{ success: true }>(
        await adminFetch(`/api/support/cases/${caseId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(action),
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "support"] }),
  });
}

/**
 * Tell the merchant a person read their message. Quiet: no refetch of the
 * inbox, and the server only moves the mark when there is something new.
 */
export function useSupportMarkSeen(caseId: string) {
  return useMutation({
    mutationFn: async () =>
      readJson<{ success: true; moved: boolean }>(
        await adminFetch(`/api/support/cases/${caseId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "seen" } satisfies CaseAction),
        }),
      ),
  });
}

/** Everyone a conversation can be handed to. Rarely changes. */
export function useSupportTeam() {
  return useQuery<SupportTeammate[]>({
    queryKey: ["admin", "support", "team"],
    queryFn: async () => (await readJson<{ team: SupportTeammate[] }>(await adminFetch("/api/support/team"))).team,
    staleTime: 5 * 60_000,
  });
}

/** The team scoreboard for the last 7 or 30 days. */
export function useSupportScoreboard(days: ScoreboardDays) {
  return useQuery<SupportScoreboard>({
    queryKey: ["admin", "support", "scoreboard", days],
    queryFn: async () => readJson<SupportScoreboard>(await adminFetch(`/api/support/scoreboard?days=${days}`)),
    refetchInterval: 60_000,
  });
}

/** "Check this shop": runs only when staff press the button, then on demand. */
export function useSupportShopCheck(caseId: string, enabled: boolean) {
  return useQuery<{ tenantId: string; check: ShopCheck }>({
    queryKey: ["admin", "support", "shop-check", caseId],
    queryFn: async () =>
      readJson<{ tenantId: string; check: ShopCheck }>(await adminFetch(`/api/support/cases/${caseId}/check`)),
    enabled,
    staleTime: 30_000,
  });
}

/** Shops with something wrong right now. Refreshes every minute. */
export function useSupportNeedsUs() {
  return useQuery<NeedsUsShop[]>({
    queryKey: ["admin", "support", "needs-us"],
    queryFn: async () => (await readJson<{ shops: NeedsUsShop[] }>(await adminFetch("/api/support/needs-us"))).shops,
    refetchInterval: 60_000,
  });
}

/** Write first to a shop that needs us; answers the conversation it went into. */
export function useSupportStartConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: StartConversation) =>
      readJson<{ caseId: string; started: boolean }>(
        await adminFetch("/api/support/needs-us", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "support"] }),
  });
}

/** The first-week plan tasks due today, with who I am so mine sort first. */
export function useSupportTasks() {
  return useQuery<{ tasks: SupportTask[]; me: string }>({
    queryKey: ["admin", "support", "tasks"],
    queryFn: async () => readJson<{ tasks: SupportTask[]; me: string }>(await adminFetch("/api/support/tasks")),
    refetchInterval: 60_000,
  });
}

/** Record a call on a first-week task. */
export function useSupportLogTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TaskLogInput) =>
      readJson<{ success: true }>(
        await adminFetch("/api/support/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "support"] }),
  });
}

/** "Take this shop": become its named support person. */
export function useSupportTakeShop() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (tenantId: string) =>
      readJson<{ success: true }>(
        await adminFetch("/api/support/owner", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId }),
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "support"] }),
  });
}

/** Start a 30-minute look-only view of a shop; answers a one-time sign-in link. */
export function useSupportViewStart() {
  return useMutation({
    mutationFn: async (tenantId: string) =>
      readJson<{ url: string; expiresAt: string }>(
        await adminFetch("/api/support/view", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tenantId }),
        }),
      ),
  });
}

/** End my look-only view now. */
export function useSupportViewEnd() {
  return useMutation({
    mutationFn: async () => readJson<{ success: true }>(await adminFetch("/api/support/view", { method: "DELETE" })),
  });
}

/** The notice merchants see now at the top of their Help chat. */
export function useSupportNotice() {
  return useQuery<SupportNotice | null>({
    queryKey: ["admin", "support", "notice"],
    queryFn: async () =>
      (await readJson<{ notice: SupportNotice | null }>(await adminFetch("/api/support/notices"))).notice,
    refetchInterval: 60_000,
  });
}

/** Several shops writing about the same thing in the last 30 minutes, if so. */
export function useSupportSpike() {
  return useQuery<SupportSpike | null>({
    queryKey: ["admin", "support", "spike"],
    queryFn: async () => (await readJson<{ spike: SupportSpike | null }>(await adminFetch("/api/support/spike"))).spike,
    refetchInterval: 60_000,
  });
}

/** Post a notice to every merchant (replaces the live one). */
export function useSupportNoticePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: NoticePostInput) =>
      readJson<{ notice: SupportNotice }>(
        await adminFetch("/api/support/notices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "support", "notice"] }),
  });
}

/** End the live notice now. */
export function useSupportNoticeEnd() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => readJson<{ ended: number }>(await adminFetch("/api/support/notices", { method: "DELETE" })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "support", "notice"] }),
  });
}
