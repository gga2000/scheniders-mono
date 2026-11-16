"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Headset, Loader2, MessageSquareText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSupportCase, useSupportCases, useSupportNeedsUs, useSupportTasks } from "@/hooks/use-support-cases";
import { SupportCaseList } from "@/components/support/support-case-list";
import { SupportConversation } from "@/components/support/support-conversation";
import { SupportShopCard } from "@/components/support/support-shop-card";
import { SupportAlertsToggle } from "@/components/support/support-alerts-toggle";
import { SupportScoreboardView } from "@/components/support/support-scoreboard";
import { SupportNeedsUs } from "@/components/support/support-needs-us";
import { SupportToday } from "@/components/support/support-today";
import { SupportNoticeBar } from "@/components/support/support-notice-bar";
import type { ScoreboardDays } from "@/lib/support";

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
  const linkedCase = useSearchParams().get("case");
  const [view, setView] = useState<View>("open");
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
  const waiting = list.data?.waitingOnUs ?? 0;
  const needsUs = useSupportNeedsUs().data?.length ?? 0;
  const tasks = useSupportTasks().data;
  const myCalls = tasks ? tasks.tasks.filter((t) => t.owner_id === tasks.me).length : 0;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Headset className="h-6 w-6" />
            Support
          </h1>
          <p className="mt-1 text-foreground-muted">
            {list.isLoading
              ? "Loading..."
              : waiting === 0
                ? "No merchant is waiting on us."
                : `${waiting} merchant${waiting === 1 ? "" : "s"} waiting on us`}
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
                {v.id === "needs" && needsUs > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-bold tabular-nums text-amber-900">
                    {needsUs}
                  </span>
                )}
                {v.id === "today" && myCalls > 0 && (
                  <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-xs font-bold tabular-nums text-sky-900">
                    {myCalls}
                  </span>
                )}
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
      ) : list.isError ? (
        <div className={cn(PANE, "p-6 text-sm text-red-700")}>
          Could not load support conversations. {list.error.message}
        </div>
      ) : (
        <div className="grid h-[calc(100vh-16.5rem)] min-h-[520px] grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_300px]">
          <div className={cn(PANE, "overflow-y-auto")}>
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
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-foreground/40">
                <MessageSquareText className="h-10 w-10" />
                <p className="text-sm font-medium">
                  When a merchant presses Help in their app, the conversation shows up here.
                </p>
              </div>
            ) : detail.isError ? (
              <div className="p-6 text-sm text-red-700">{detail.error.message}</div>
            ) : detail.data ? (
              <SupportConversation
                key={detail.data.case.id}
                supportCase={detail.data.case}
                messages={detail.data.messages}
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-foreground/30" />
              </div>
            )}
          </div>

          <div className={PANE}>
            {detail.data && activeId !== null ? (
              <SupportShopCard shop={detail.data.shop} caseId={detail.data.case.id} />
            ) : (
              <div className="flex h-full items-center justify-center p-6 text-center text-sm text-foreground/40">
                The shop&apos;s plan, wallet and orders show here.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
