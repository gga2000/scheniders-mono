"use client";

import { useMemo, useRef } from "react";
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
  ShopCallInput,
  SupportTeammate,
  TaskLogInput,
} from "@/lib/support";
import { TRIAL_FOLLOW_UP_KEY } from "@/lib/trial-pipeline";
import type { ShopCheck } from "@/lib/support-shop-check";
import type { SupportSpike } from "@/lib/support-spike";
import { SHELL_READ, useAfterPageReads } from "@/hooks/use-after-page-reads";
import { adminFetch } from "@/lib/admin-fetch";
import { SUPPORT_SEND_UNSURE, writesOnce } from "@/lib/support";
import { AnswerLost, failureOf, sendJson } from "@/components/merchants/detail/action-ui";

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

/**
 * One id per ask, kept until it goes through. The ask is what staff send (the
 * conversation, the words, the outcome): pressing again after an error or a
 * lost answer sends the same id, and the database writes once. Once it goes
 * through, the same words again are a new ask. Kept for the page's life: the
 * words of a send are not kept across a reload either.
 *
 * Unlike money asks (lib/request-ids.ts), the words are the ask here: a reply
 * in other words is another message, never a retry of the first.
 */
function useAskIds() {
  const ids = useRef(new Map<string, string>());
  return useMemo(
    () => ({
      askId(ask: unknown): { key: string; id: string } {
        const key = JSON.stringify(ask);
        const known = ids.current.get(key);
        if (known) return { key, id: known };
        const id = crypto.randomUUID();
        ids.current.set(key, id);
        return { key, id };
      },
      done(key: string) {
        ids.current.delete(key);
      },
    }),
    [],
  );
}

/**
 * POSTs one send with its id, through the console's one sender (sendJson and
 * failureOf), so its words match every other write. A lost answer, whether the
 * connection dropped or a gateway answered with no words, says the send may
 * have been done and that pressing again with the same words is safe.
 */
async function sendOnce<T>(url: string, body: unknown): Promise<T> {
  const answer = await sendJson(url, body).catch((error: unknown) => {
    throw error instanceof AnswerLost ? new AnswerLost(SUPPORT_SEND_UNSURE) : error;
  });
  if (answer.ok) return answer.data as T;
  const failure = failureOf(answer.status, answer.data, "Request failed");
  throw failure instanceof AnswerLost ? new AnswerLost(SUPPORT_SEND_UNSURE) : failure;
}

/**
 * A send that keeps its id until it goes through: `run(ask)` posts the ask
 * with its id, and a success ends that ask.
 */
function useSendOnce<A, T>(url: string, withId: (ask: A) => boolean = () => true) {
  const ids = useAskIds();
  return async (ask: A): Promise<T> => {
    if (!withId(ask)) return sendOnce<T>(url, ask);
    const { key, id } = ids.askId([url, ask]);
    const answer = await sendOnce<T>(url, { ...ask, request_id: id });
    ids.done(key);
    return answer;
  };
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

/** A step on one conversation; a reply or a note is sent once however often it is pressed. */
export function useSupportCaseAction(caseId: string) {
  const queryClient = useQueryClient();
  const send = useSendOnce<CaseAction, { success: true }>(`/api/support/cases/${caseId}`, writesOnce);
  return useMutation({
    mutationFn: send,
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
  const send = useSendOnce<StartConversation, { caseId: string; started: boolean }>("/api/support/needs-us");
  return useMutation({
    mutationFn: send,
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
  const send = useSendOnce<TaskLogInput, { success: true }>("/api/support/tasks");
  return useMutation({
    mutationFn: send,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "support"] }),
  });
}

/** Record a call on a shop with no task (Trials, "Mark contacted"): the shop's last call shows it. */
export function useSupportLogShopCall() {
  const queryClient = useQueryClient();
  const send = useSendOnce<ShopCallInput, { success: true }>("/api/support/calls");
  return useMutation({
    mutationFn: send,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "support"] });
      queryClient.invalidateQueries({ queryKey: TRIAL_FOLLOW_UP_KEY });
    },
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
  const send = useSendOnce<NoticePostInput, { notice: SupportNotice }>("/api/support/notices");
  return useMutation({
    mutationFn: send,
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
