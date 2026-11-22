"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { waitingBadge } from "@/lib/admin-menu";
import { useSupportCase, useSupportCases, useSupportNeedsUs, useSupportTasks } from "@/hooks/use-support-cases";
import { SupportCaseList } from "@/components/support/support-case-list";
import { SupportConversation } from "@/components/support/support-conversation";
import { SupportShopCard } from "@/components/support/support-shop-card";
import { SupportAlertsToggle } from "@/components/support/support-alerts-toggle";
import { SupportScoreboardView } from "@/components/support/support-scoreboard";
import { SupportNeedsUs } from "@/components/support/support-needs-us";
import { SupportToday } from "@/components/support/support-today";
import { SupportNoticeBar } from "@/components/support/support-notice-bar";
import { SupportTabCount } from "@/components/support/support-tab-count";
import { LoadError } from "@/components/shared/load-error";
import { StaleLine } from "@/components/shared/stale-line";
import { waitingOnUsLine, type ScoreboardDays } from "@/lib/support";

type View = "open" | "solved" | "needs" | "today" | "scoreboard";

const VIEWS: { id: View; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "solved", label: "Solved" },
  { id: "needs", label: "Needs us" },
  { id: "today", label: "Today" },
  { id: "scoreboard", label: "Scoreboard" },
];

const PANE = "min-h-0 overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SupportPage() {
  return (
    <Suspense>
      <SupportInbox />
    </Suspense>
  );
}

function SupportInbox() {
  // An alert links to /support?case=<id>: open that conversation first.
  // The weekly report links to /support?view=scoreboard.
  const params = useSearchParams();
  const linkedCase = params.get("case");
  const [view, setView] = useState<View>(params.get("view") === "scoreboard" ? "scoreboard" : "open");
  const [selectedId, setSelectedId] = useState<string | null>(
    linkedCase && UUID_RE.test(linkedCase) ? linkedCase : null,
  );
  const [boardDays, setBoardDays] = useState<ScoreboardDays>(7);
  // The scoreboard keeps the open inbox loaded for the "waiting on us" line.
  const list = useSupportCases(view === "solved" ? "solved" : "open");
  const cases = list.data?.cases ?? [];
  // Nothing picked yet: open the conversation that has waited longest.
  const inbox = view === "open" || view === "solved";
  const activeId = inbox ? (selectedId ?? cases[0]?.id ?? null) : null;
  const detail = useSupportCase(activeId);
  // A failed read shows "?" on its tab, not no count: no count reads as nothing waiting.
  const needsUsRead = useSupportNeedsUs();
  const needsUs = waitingBadge(
    { data: needsUsRead.data?.length, isError: needsUsRead.isError },
    "to look at",
    "the shops that need us",
  );
  const tasks = useSupportTasks();
  const myCalls = waitingBadge(
    { data: tasks.data?.tasks.filter((t) => t.owner_id === tasks.data?.me).length, isError: tasks.isError },
    "to call today",
    "today's calls",
  );

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold text-foreground">Support</h1>
          <p className="text-[13px] text-foreground/70">
            {waitingOnUsLine({ count: list.data?.waitingOnUs, isError: list.isError })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SupportAlertsToggle />
          <div className="inline-flex rounded-full border border-[var(--card-border)] bg-[var(--card-bg)] p-1">
            {VIEWS.map((v) => (
              <button
                key={v.id}
                type="button"
                onClick={() => {
                  setView(v.id);
                  setSelectedId(null);
                }}
                className={cn(
                  "rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                  view === v.id ? "bg-foreground text-background" : "text-foreground-muted hover:text-foreground",
                )}
              >
                {v.label}
                {v.id === "needs" && <SupportTabCount badge={needsUs} tone="bg-amber-500/15 text-[var(--ink-amber)]" />}
                {v.id === "today" && <SupportTabCount badge={myCalls} tone="bg-sky-500/15 text-[var(--ink-blue)]" />}
              </button>
            ))}
          </div>
        </div>
      </div>

      <SupportNoticeBar />

      {view === "scoreboard" ? (
        <SupportScoreboardView days={boardDays} onDaysChange={setBoardDays} />
      ) : view === "today" ? (
        <SupportToday />
      ) : view === "needs" ? (
        <SupportNeedsUs
          onOpenCase={(caseId) => {
            setView("open");
            setSelectedId(caseId);
          }}
        />
      ) : list.isError && !list.data ? (
        <div className={PANE}>
          <LoadError what="the conversations" onRetry={() => void list.refetch()} retrying={list.isFetching} error={list.error} />
        </div>
      ) : (
        <div className="grid h-[calc(100vh-16.5rem)] min-h-[520px] grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
          <div className={cn(PANE, "overflow-y-auto")}>
            {/* A failed 10 s re-read keeps the list it had and says how old it is. */}
            <StaleLine
              read={list}
              what="the conversations"
              kept="list"
              className="border-b border-[var(--card-border)] px-4 py-2"
            />
            <SupportCaseList
              cases={cases}
              selectedId={activeId}
              onSelect={setSelectedId}
              isLoading={list.isLoading}
              emptyLabel={view === "open" ? "Inbox is clear." : "No solved conversations yet."}
            />
          </div>

          <div className={PANE}>
            {activeId === null ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-foreground/70">
                <MessageSquareText className="h-10 w-10" />
                <p className="text-sm font-medium">
                  When a merchant presses Help in their app, the conversation shows up here.
                </p>
              </div>
            ) : detail.isError && !detail.data ? (
              <LoadError
                what="this conversation"
                onRetry={() => void detail.refetch()}
                retrying={detail.isFetching}
                error={detail.error}
                compact
              />
            ) : detail.data ? (
              // A failed 5 s re-read keeps the conversation drawn, so the reply
              // or note being typed (and its send's id) stays; a line says so.
              <div className="flex h-full flex-col">
                <StaleLine
                  read={detail}
                  what="this conversation"
                  kept="page"
                  gone="This conversation is no longer there."
                  className="border-b border-[var(--card-border)] px-4 py-2"
                />
                <div className="min-h-0 flex-1">
                  <SupportConversation
                    key={detail.data.case.id}
                    supportCase={detail.data.case}
                    messages={detail.data.messages}
                    notes={detail.data.notes}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-foreground/70" />
              </div>
            )}
          </div>

          <div className={PANE}>
            {detail.data && activeId !== null ? (
              <SupportShopCard shop={detail.data.shop} caseId={detail.data.case.id} />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-foreground/70">
                The shop&apos;s plan, wallet and orders show here.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
