"use client";

import { useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
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
import { SUPPORT_NOTICE_END_UNSURE, SUPPORT_SEND_UNSURE, SUPPORT_VIEW_UNSURE, writesOnce } from "@/lib/support";
import { AnswerLost } from "@/lib/answer-lost";
import { failureOf, sendJson } from "@/lib/send-json";
import { okOrLoadFailure } from "@/lib/load-failure";

/**
 * A read's answer, or a LoadFailure with the server's status, so the page can
 * tell a refused login or a gone conversation from a dropped connection.
 */
async function readOk<T>(res: Response, what: string): Promise<T> {
  return (await okOrLoadFailure(res, what).json()) as T;
}

/**
 * A step with no id, through the console's one sender: a lost answer says it
 * may have been done (with where to look), never the browser's "Failed to fetch".
 */
async function sendStep<T>(
  url: string,
  body: unknown,
  method: "POST" | "DELETE" = "POST",
  lost?: string,
): Promise<T> {
  const answer = await sendJson(url, body, method).catch((error: unknown) => {
    throw error instanceof AnswerLost && lost ? new AnswerLost(lost) : error;
  });
  if (answer.ok) return answer.data as T;
  const failure = failureOf(answer.status, answer.data, "Request failed");
  throw failure instanceof AnswerLost && lost ? new AnswerLost(lost) : failure;
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

/**
 * After a support step: re-read every support panel, but stay pending only
 * until the step's own read lands (its conversation, its list). Waiting on all
 * of them kept a sent reply spinning while the scoreboard or the spike check
 * was slow (round 24, UX new 3).
 */
function settleOn(queryClient: QueryClient, own: readonly unknown[]): Promise<void> {
  const ownKey = JSON.stringify(own);
  void queryClient.invalidateQueries({
    queryKey: ["admin", "support"],
    predicate: (query) => JSON.stringify(query.queryKey) !== ownKey,
  });
  return queryClient.invalidateQueries({ queryKey: [...own], exact: true });
}

/** The inbox list. Polls so a new merchant message shows up without a reload. */
export function useSupportCases(view: "open" | "solved") {
  return useQuery<SupportCasesResponse>({
    queryKey: ["admin", "support", "cases", view],
    queryFn: async () => readOk<SupportCasesResponse>(await adminFetch(`/api/support/cases?view=${view}`), "the conversations"),
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
      (await readOk<{ waitingOnUs: number }>(await adminFetch("/api/support/cases?view=count"), "the waiting count")).waitingOnUs,
    refetchInterval: 30_000,
  });
}

/** One conversation with its messages and shop card. Polls while it is open. */
export function useSupportCase(caseId: string | null) {
  return useQuery<SupportCaseDetailResponse>({
    queryKey: ["admin", "support", "case", caseId],
    queryFn: async () => readOk<SupportCaseDetailResponse>(await adminFetch(`/api/support/cases/${caseId}`), "this conversation"),
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
    onSettled: () => settleOn(queryClient, ["admin", "support", "case", caseId]),
  });
}

/**
 * Tell the merchant a person read their message. Quiet: no refetch of the
 * inbox, and the server only moves the mark when there is something new.
 */
export function useSupportMarkSeen(caseId: string) {
  return useMutation({
    mutationFn: async () =>
      sendStep<{ success: true; moved: boolean }>(`/api/support/cases/${caseId}`, { action: "seen" } satisfies CaseAction),
  });
}

/** Everyone a conversation can be handed to. Rarely changes. */
export function useSupportTeam() {
  return useQuery<SupportTeammate[]>({
    queryKey: ["admin", "support", "team"],
    queryFn: async () => (await readOk<{ team: SupportTeammate[] }>(await adminFetch("/api/support/team"), "the team")).team,
    staleTime: 5 * 60_000,
  });
}

/** The team scoreboard for the last 7 or 30 days. */
export function useSupportScoreboard(days: ScoreboardDays) {
  return useQuery<SupportScoreboard>({
    queryKey: ["admin", "support", "scoreboard", days],
    queryFn: async () => readOk<SupportScoreboard>(await adminFetch(`/api/support/scoreboard?days=${days}`), "the scoreboard"),
    refetchInterval: 60_000,
  });
}

/** "Check this shop": runs only when staff press the button, then on demand. */
export function useSupportShopCheck(caseId: string, enabled: boolean) {
  return useQuery<{ tenantId: string; check: ShopCheck }>({
    queryKey: ["admin", "support", "shop-check", caseId],
    queryFn: async () =>
      readOk<{ tenantId: string; check: ShopCheck }>(await adminFetch(`/api/support/cases/${caseId}/check`), "the shop check"),
    enabled,
    staleTime: 30_000,
  });
}

/** Shops with something wrong right now. Refreshes every minute. */
export function useSupportNeedsUs() {
  return useQuery<NeedsUsShop[]>({
    queryKey: ["admin", "support", "needs-us"],
    queryFn: async () => (await readOk<{ shops: NeedsUsShop[] }>(await adminFetch("/api/support/needs-us"), "the shops that need us")).shops,
    refetchInterval: 60_000,
  });
}

/** Write first to a shop that needs us; answers the conversation it went into. */
export function useSupportStartConversation() {
  const queryClient = useQueryClient();
  const send = useSendOnce<StartConversation, { caseId: string; started: boolean }>("/api/support/needs-us");
  return useMutation({
    mutationFn: send,
    onSettled: () => settleOn(queryClient, ["admin", "support", "needs-us"]),
  });
}

/** The first-week plan tasks due today, with who I am so mine sort first. */
export function useSupportTasks() {
  return useQuery<{ tasks: SupportTask[]; me: string }>({
    queryKey: ["admin", "support", "tasks"],
    queryFn: async () => readOk<{ tasks: SupportTask[]; me: string }>(await adminFetch("/api/support/tasks"), "today's calls"),
    refetchInterval: 60_000,
  });
}

/** Record a call on a first-week task. */
export function useSupportLogTask() {
  const queryClient = useQueryClient();
  const send = useSendOnce<TaskLogInput, { success: true }>("/api/support/tasks");
  return useMutation({
    mutationFn: send,
    onSettled: () => settleOn(queryClient, ["admin", "support", "tasks"]),
  });
}

/** Record a call on a shop with no task (Trials, "Mark contacted"): the shop's last call shows it. */
export function useSupportLogShopCall() {
  const queryClient = useQueryClient();
  const send = useSendOnce<ShopCallInput, { success: true }>("/api/support/calls");
  return useMutation({
    mutationFn: send,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "support"] });
      void queryClient.invalidateQueries({ queryKey: TRIAL_FOLLOW_UP_KEY });
    },
  });
}

/** "Take this shop": become its named support person. */
export function useSupportTakeShop() {
  const queryClient = useQueryClient();
  return useMutation({
    // Taking a shop twice changes nothing, so a lost answer may just be pressed again.
    mutationFn: async (tenantId: string) =>
      sendStep<{ success: true }>("/api/support/owner", { tenantId }, "POST", SUPPORT_SEND_UNSURE),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "support"] });
    },
  });
}

/** Start a 30-minute look-only view of a shop; answers a one-time sign-in link. */
export function useSupportViewStart() {
  return useMutation({
    // A lost answer may have opened a look (and logged a visit the merchant sees): look first.
    mutationFn: async (tenantId: string) =>
      sendStep<{ url: string; expiresAt: string }>("/api/support/view", { tenantId }, "POST", SUPPORT_VIEW_UNSURE),
  });
}

/** End my look-only view now. */
export function useSupportViewEnd() {
  return useMutation({
    // Ending twice changes nothing, so a lost answer may just be pressed again.
    mutationFn: async () => sendStep<{ success: true }>("/api/support/view", undefined, "DELETE", SUPPORT_SEND_UNSURE),
  });
}

/** The notice merchants see now at the top of their Help chat. */
export function useSupportNotice() {
  return useQuery<SupportNotice | null>({
    queryKey: ["admin", "support", "notice"],
    queryFn: async () =>
      (await readOk<{ notice: SupportNotice | null }>(await adminFetch("/api/support/notices"), "the merchant notice")).notice,
    refetchInterval: 60_000,
  });
}

/** Several shops writing about the same thing in the last 30 minutes, if so. */
export function useSupportSpike() {
  return useQuery<SupportSpike | null>({
    queryKey: ["admin", "support", "spike"],
    queryFn: async () => (await readOk<{ spike: SupportSpike | null }>(await adminFetch("/api/support/spike"), "the shared problem check")).spike,
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
    // Ending again could end a notice a teammate posted since: the words say to look first.
    mutationFn: async () =>
      sendStep<{ ended: number }>("/api/support/notices", undefined, "DELETE", SUPPORT_NOTICE_END_UNSURE),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["admin", "support", "notice"] }),
  });
}
