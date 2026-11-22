"use client";

import { useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, StickyNote, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { MentionTextarea } from "@/components/shared/mention-textarea";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { useLeaveGuard } from "@/hooks/use-leave-guard";
import { hasPermission } from "@/lib/admin-permissions";
import { formatCount, formatDay, formatTime } from "@/lib/format";
import { dayOf } from "@/lib/baghdad-day";
import { groupOrderFees, type TimelineEntry, type TimelineKind } from "@/lib/shop-timeline";
import { Choice, ErrorLine, postJson } from "./action-ui";
import { adminFetch } from "@/lib/admin-fetch";

interface TimelinePage {
  entries: TimelineEntry[];
  nextBefore: string | null;
}

const FILTERS: Array<{ value: TimelineKind | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "money", label: "Money" },
  { value: "change", label: "Changes" },
  { value: "note", label: "Notes" },
];

const KIND_ICON: Record<TimelineKind, typeof Wallet> = { money: Wallet, change: Pencil, note: StickyNote };

/**
 * Board m5: one dated list for the shop, newest first, with a note box on
 * top. Money shows the amount and the wallet after; every row says who did it.
 */
export function TimelineTab({ merchantId, focusNote = false }: { merchantId: string; focusNote?: boolean }) {
  const queryClient = useQueryClient();
  const { role } = useAdminAuth();
  const [filter, setFilter] = useState<TimelineKind | "all">("all");
  const [note, setNote] = useState("");

  const timeline = useInfiniteQuery<TimelinePage>({
    queryKey: ["admin", "merchant", merchantId, "timeline"],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const query = typeof pageParam === "string" ? `?before=${encodeURIComponent(pageParam)}` : "";
      const res = await adminFetch(`/api/merchants/${merchantId}/timeline${query}`);
      if (!res.ok) throw new Error("Could not load the timeline.");
      return res.json();
    },
    getNextPageParam: (last) => last.nextBefore,
  });

  const addNote = useMutation({
    mutationFn: (content: string) => postJson(`/api/merchants/${merchantId}/notes`, { content }),
    onSuccess: () => {
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["admin", "merchant", merchantId] });
    },
  });
  const canNote = role ? hasPermission(role, "add_note") : false;
  // A note being written survives an ended sign-in's reload: leaving asks first.
  useLeaveGuard(canNote && note.trim() !== "");
  const submit = () => {
    const content = note.trim();
    if (content && !addNote.isPending) addNote.mutate(content);
  };

  const days = useMemo(() => {
    const all = groupOrderFees(timeline.data?.pages.flatMap((page) => page.entries) ?? []);
    const shown = filter === "all" ? all : all.filter((entry) => entry.kind === filter);
    const byDay = new Map<string, TimelineEntry[]>();
    for (const entry of shown) {
      const key = dayOf(entry.at);
      const list = byDay.get(key);
      if (list) list.push(entry);
      else byDay.set(key, [entry]);
    }
    return Array.from(byDay.values());
  }, [timeline.data, filter]);

  return (
    <section className="pastel-card p-5" aria-label="Timeline">
      {canNote && (
        <div className="mb-5 border-b border-[var(--card-border)] pb-5">
          <label htmlFor="shop-note" className="text-[13px] font-semibold text-foreground">
            Add a note
          </label>
          <div className="mt-2">
            <MentionTextarea
              value={note}
              onChange={setNote}
              onSubmit={submit}
              autoFocus={focusNote}
              rows={2}
              placeholder="What should colleagues know before they call? Use @ to name someone."
              className="bg-transparent px-3 py-2.5 text-[15px] placeholder:text-foreground/45 focus:border-foreground/40 focus:ring-0"
            />
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-[13px] text-foreground/70">Staff only. Enter adds it; Shift and Enter start a new line.</p>
            <button
              type="button"
              onClick={submit}
              disabled={!note.trim() || addNote.isPending}
              className="shrink-0 rounded-lg bg-emerald-700 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-50"
            >
              {addNote.isPending ? "Adding..." : "Add note"}
            </button>
          </div>
          <ErrorLine error={addNote.error} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Show">
        {FILTERS.map((option) => (
          <Choice key={option.value} selected={filter === option.value} onClick={() => setFilter(option.value)}>
            {option.label}
          </Choice>
        ))}
      </div>

      {timeline.isLoading ? (
        <p className="flex items-center gap-2 py-6 text-[13px] text-foreground/70">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading the timeline...
        </p>
      ) : timeline.isError ? (
        <p role="alert" className="py-6 text-[13px] font-medium text-[var(--ink-red)]">
          {timeline.error.message}{" "}
          <button type="button" onClick={() => timeline.refetch()} className="underline">
            Try again
          </button>
        </p>
      ) : days.length === 0 ? (
        <p className="py-6 text-[13px] text-foreground/70">
          {filter === "all"
            ? "Nothing yet. Money, changes and notes show here as they happen."
            : "Nothing of this kind in the loaded part of the timeline."}
        </p>
      ) : (
        <ol className="space-y-5">
          {days.map((entries) => (
            <li key={dayOf(entries[0].at)}>
              <h3 className="mb-1 text-[13px] font-semibold text-foreground/70">{formatDay(entries[0].at)}</h3>
              <ul className="divide-y divide-[var(--card-border)]">
                {entries.map((entry) => (
                  <Row key={entry.id} entry={entry} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}

      {timeline.hasNextPage && (
        <button
          type="button"
          onClick={() => timeline.fetchNextPage()}
          disabled={timeline.isFetchingNextPage}
          className="mt-4 rounded-lg border border-[var(--card-border)] px-3.5 py-2 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/[0.05] disabled:opacity-50"
        >
          {timeline.isFetchingNextPage ? "Loading..." : "Show older"}
        </button>
      )}
    </section>
  );
}

function Row({ entry }: { entry: TimelineEntry }) {
  const Icon = KIND_ICON[entry.kind];
  return (
    <li className="grid grid-cols-[3rem_1.25rem_1fr_auto] items-start gap-x-3 py-3">
      <span className="pt-0.5 text-[13px] tabular-nums text-foreground/70">{formatTime(entry.at)}</span>
      <Icon className="mt-1 h-4 w-4 text-foreground/70" aria-hidden />
      <div className="min-w-0">
        <p className="text-[15px] text-foreground">
          <span className="font-semibold">{entry.title}</span>
          <span className="text-[13px] text-foreground/70"> · {entry.who}</span>
        </p>
        {entry.detail && (
          <p
            className={cn(
              "mt-0.5 break-words text-[13px] text-foreground/70",
              entry.kind === "note" && "whitespace-pre-wrap text-[15px] text-foreground/85",
            )}
          >
            {entry.detail}
          </p>
        )}
      </div>
      {entry.amount === 0 ? (
        <p className="text-right text-[13px] text-foreground/70">No fee</p>
      ) : entry.amount !== null ? (
        <div className="text-right">
          <p
            className={cn(
              "text-[15px] font-semibold tabular-nums",
              entry.amount > 0 ? "text-[var(--ink-green)]" : "text-foreground",
            )}
          >
            {entry.amount > 0 ? "+" : entry.amount < 0 ? "−" : ""}
            {formatCount(Math.abs(entry.amount))} IQD
          </p>
          {entry.walletAfter !== null && (
            <p className="text-[13px] tabular-nums text-foreground/70">wallet {formatCount(entry.walletAfter)}</p>
          )}
        </div>
      ) : (
        <span />
      )}
    </li>
  );
}
