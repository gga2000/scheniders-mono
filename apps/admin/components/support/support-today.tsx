"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarCheck, CheckCircle2, ExternalLink, Loader2, PackageCheck, PhoneCall, UserRound } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLiveTick } from "@/hooks/use-live-tick";
import { useSupportLogTask, useSupportTakeShop, useSupportTasks } from "@/hooks/use-support-cases";
import { LoadError } from "@/components/shared/load-error";
import { SupportCallList } from "@/components/support/support-call-list";
import {
  CALL_OUTCOMES,
  CALL_OUTCOME_LABELS,
  callBackNumber,
  formatDue,
  sortTasks,
  taskLabel,
  type CallOutcome,
  type SupportTask,
} from "@/lib/support";

const CARD = "rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]";

const OUTCOME_BUTTON: Record<CallOutcome, string> = {
  done: "bg-[var(--primary)] text-[var(--primary-fg)]",
  no_answer: "border border-[var(--card-border)] text-foreground hover:bg-foreground/5",
  later: "border border-[var(--card-border)] text-foreground hover:bg-foreground/5",
};

/**
 * Today's first-week calls: every new shop gets a welcome call, a store check,
 * a first-order check and a call before the trial ends, from its own person.
 */
export function SupportToday() {
  const tasks = useSupportTasks();
  const now = useLiveTick(60_000);

  if (tasks.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={cn(CARD, "h-32 animate-pulse")} />
        ))}
      </div>
    );
  }

  if (tasks.isError) {
    return (
      <LoadError what="today's calls" onRetry={() => tasks.refetch()} retrying={tasks.isFetching} error={tasks.error} />
    );
  }

  const me = tasks.data?.me ?? null;
  const list = sortTasks(tasks.data?.tasks ?? [], me);
  if (list.length === 0) {
    return (
      <div className={cn(CARD, "flex flex-col items-center gap-2 px-6 py-16 text-center text-foreground/70")}>
        <CheckCircle2 className="h-8 w-8" />
        <p className="text-sm font-medium">No calls left for today.</p>
      </div>
    );
  }

  const mine = list.filter((t) => t.owner_id === me).length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground-muted">
        {list.length} call{list.length === 1 ? "" : "s"} for today, {mine} of them yours. Merchants who asked for a call come first, then new shops in their first week.
      </p>
      <ul className="space-y-3">
        {list.map((task) => (
          <TaskRow key={task.id} task={task} isMine={task.owner_id === me} now={now} />
        ))}
      </ul>
    </div>
  );
}

function TaskRow({ task, isMine, now }: { task: SupportTask; isMine: boolean; now: number }) {
  const log = useSupportLogTask();
  const take = useSupportTakeShop();
  const [note, setNote] = useState("");
  const label = taskLabel(task);
  const late = Date.parse(task.due_at) < now;

  const record = (outcome: CallOutcome) => {
    if (log.isPending) return;
    log.mutate(
      { taskId: task.id, outcome, note },
      {
        onSuccess: () => {
          setNote("");
          toast.success(
            outcome === "done"
              ? `${label.title} done`
              : outcome === "no_answer"
                ? "Back in 3 hours"
                : "Back tomorrow",
          );
        },
        onError: (error) => toast.error(error.message),
      },
    );
  };

  return (
    <li className={cn(CARD, "px-4 py-3.5", isMine && "border-l-4 border-l-[var(--primary)]")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground">
            {task.kind === "call_back" ? (
              <PhoneCall className="h-3.5 w-3.5 self-center text-[var(--ink-green)]" />
            ) : (
              <CalendarCheck className="h-3.5 w-3.5 self-center" />
            )}
            {label.title}
            <span className={cn("text-xs font-medium", late ? "text-[var(--ink-red)]" : "text-foreground-muted")}>
              {formatDue(task.due_at, now)}
            </span>
            {task.attempts > 0 && (
              <span className="text-xs font-medium text-foreground-muted">
                · try {task.attempts + 1}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-foreground-muted">{label.hint}</p>
          {task.phone && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm">
              <a
                href={callBackNumber(task.phone).href}
                className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 py-1 text-sm font-semibold tabular-nums text-white transition-opacity hover:opacity-90"
              >
                <PhoneCall className="h-3.5 w-3.5" />
                <span dir="ltr">{callBackNumber(task.phone).label}</span>
              </a>
              {task.requested_by && (
                <span className="text-xs text-foreground-muted">
                  asked by <span dir="auto">{task.requested_by}</span>
                </span>
              )}
            </p>
          )}
        </div>
        <Link
          href={`/merchants/${task.tenant_id}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-foreground/5"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span dir="auto">{task.business_name}</span>
          {task.display_id !== null && <span className="text-foreground/70">#{task.display_id}</span>}
        </Link>
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted">
        <span className="inline-flex items-center gap-1">
          <UserRound className="h-3 w-3" />
          {isMine ? "Yours" : task.owner_name ? <span dir="auto">{task.owner_name}</span> : "Nobody yet"}
          {!isMine && (
            <button
              type="button"
              disabled={take.isPending}
              onClick={() =>
                take.mutate(task.tenant_id, {
                  onSuccess: () => toast.success("This shop is yours now"),
                  onError: (error) => toast.error(error.message),
                })
              }
              className="ml-1 font-semibold text-foreground underline-offset-2 hover:underline disabled:opacity-50"
            >
              Take it
            </button>
          )}
        </span>
        <span className="inline-flex items-center gap-1">
          <PackageCheck className="h-3 w-3" />
          {task.orders === 0 ? "No orders yet" : `${task.orders.toLocaleString("en-US")} orders`}
        </span>
        {task.shop_status === "trial" && task.trial_ends_at && (
          <span>Trial ends {new Date(task.trial_ends_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>
        )}
      </p>

      {task.calls.length > 0 && (
        <div className="mt-2.5 rounded-xl bg-foreground/[0.03] px-3 py-2">
          <SupportCallList calls={task.calls} now={now} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          dir="auto"
          placeholder="What did they say? (one line, the next person sees it)"
          className="min-w-[220px] flex-1 rounded-full border border-[var(--card-border)] bg-transparent px-3.5 py-1.5 text-sm text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-[var(--primary)]/30"
        />
        {CALL_OUTCOMES.map((outcome) => (
          <button
            key={outcome}
            type="button"
            disabled={log.isPending}
            onClick={() => record(outcome)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
              OUTCOME_BUTTON[outcome],
            )}
          >
            {log.isPending && log.variables?.outcome === outcome && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {CALL_OUTCOME_LABELS[outcome]}
          </button>
        ))}
      </div>
    </li>
  );
}
