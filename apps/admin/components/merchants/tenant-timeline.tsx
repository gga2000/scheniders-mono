"use client";

import { useState, useMemo } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CircleDollarSign,
  Clock,
  Filter,
  RotateCcw,
  Sparkles,
  StickyNote,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const fmtCurrency = (n: number) => new Intl.NumberFormat("en-IQ").format(n);

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  if (day < 30) return `${Math.floor(day / 7)}w ago`;
  if (day < 365) return `${Math.floor(day / 30)}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
}

function formatDayHeader(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== today.getFullYear() ? "numeric" : undefined,
  });
}

type EventKind =
  | "topup"
  | "charge"
  | "refund"
  | "adjustment"
  | "wallet_other"
  | "note"
  | "created"
  | "plan";

type FilterKey = "all" | "money" | "note" | "status";

interface TimelineEvent {
  id: string;
  kind: EventKind;
  title: string;
  subtitle?: string;
  timestamp: string;
  amount?: { value: number; sign: "+" | "-" | "" };
}

const EVENT_META: Record<
  EventKind,
  {
    label: string;
    chip: string;
    tile: string;
    amount: string;
    icon: typeof ArrowUpRight;
  }
> = {
  topup: {
    label: "Top up",
    chip: "bg-gradient-to-br from-emerald-400 to-teal-500 text-white shadow-sm shadow-emerald-500/30 ring-1 ring-white/20",
    tile: "bg-gradient-to-br from-emerald-400 to-teal-500",
    amount: "text-emerald-600 dark:text-emerald-400",
    icon: ArrowDownLeft,
  },
  charge: {
    label: "Charge",
    chip: "bg-gradient-to-br from-rose-400 to-pink-500 text-white shadow-sm shadow-rose-500/30 ring-1 ring-white/20",
    tile: "bg-gradient-to-br from-rose-400 to-pink-500",
    amount: "text-rose-600 dark:text-rose-400",
    icon: ArrowUpRight,
  },
  refund: {
    label: "Refund",
    chip: "bg-gradient-to-br from-sky-400 to-cyan-500 text-white shadow-sm shadow-sky-500/30 ring-1 ring-white/20",
    tile: "bg-gradient-to-br from-sky-400 to-cyan-500",
    amount: "text-sky-600 dark:text-sky-400",
    icon: RotateCcw,
  },
  adjustment: {
    label: "Adjustment",
    chip: "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30 ring-1 ring-white/20",
    tile: "bg-gradient-to-br from-violet-500 to-fuchsia-500",
    amount: "text-violet-600 dark:text-violet-400",
    icon: Sparkles,
  },
  wallet_other: {
    label: "Wallet",
    chip: "bg-foreground/10 text-foreground/70 ring-1 ring-foreground/10",
    tile: "bg-gradient-to-br from-slate-400 to-slate-500",
    amount: "text-foreground",
    icon: CircleDollarSign,
  },
  note: {
    label: "Note",
    chip: "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-amber-500/30 ring-1 ring-white/20",
    tile: "bg-gradient-to-br from-amber-400 to-orange-500",
    amount: "text-foreground",
    icon: StickyNote,
  },
  created: {
    label: "Created",
    chip: "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30 ring-1 ring-white/20",
    tile: "bg-gradient-to-br from-violet-500 to-fuchsia-500",
    amount: "text-foreground",
    icon: Zap,
  },
  plan: {
    label: "Plan",
    chip: "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30 ring-1 ring-white/20",
    tile: "bg-gradient-to-br from-violet-500 to-fuchsia-500",
    amount: "text-foreground",
    icon: Sparkles,
  },
};

function txKindToEvent(type: string): EventKind {
  const t = type.toLowerCase();
  if (t === "topup" || t === "top_up" || t === "deposit") return "topup";
  if (t === "charge" || t === "debit") return "charge";
  if (t === "refund") return "refund";
  if (t === "adjustment") return "adjustment";
  return "wallet_other";
}

interface TenantTimelineProps {
  transactions: Array<{
    id: string;
    type: string;
    amount_iqd: number;
    description: string | null;
    created_at: string;
  }>;
  notes: Array<{
    id: string;
    content: string;
    created_at: string;
    admin_user?: { full_name: string | null; email: string };
  }>;
  orderCount: number;
  tenant: {
    status: string;
    created_at: string;
    plan: string;
  };
}

const FILTERS: Array<{ value: FilterKey; label: string }> = [
  { value: "all", label: "All" },
  { value: "money", label: "Money" },
  { value: "note", label: "Notes" },
  { value: "status", label: "Status" },
];

export function TenantTimeline({ transactions, notes, tenant }: TenantTimelineProps) {
  const [filter, setFilter] = useState<FilterKey>("all");
  const [visibleCount, setVisibleCount] = useState(20);

  const events = useMemo(() => {
    const items: TimelineEvent[] = [];

    transactions.forEach((tx) => {
      const kind = txKindToEvent(tx.type);
      const isCredit = kind === "topup" || kind === "refund";
      const isDebit = kind === "charge";
      items.push({
        id: `tx-${tx.id}`,
        kind,
        title:
          kind === "topup"
            ? "Wallet top-up"
            : kind === "charge"
              ? "Wallet charge"
              : kind === "refund"
                ? "Refund issued"
                : kind === "adjustment"
                  ? "Wallet adjustment"
                  : `Wallet ${tx.type}`,
        subtitle: tx.description ?? undefined,
        timestamp: tx.created_at,
        amount: {
          value: tx.amount_iqd,
          sign: isCredit ? "+" : isDebit ? "-" : "",
        },
      });
    });

    notes.forEach((note) => {
      const author = note.admin_user?.full_name || note.admin_user?.email || "Admin";
      items.push({
        id: `note-${note.id}`,
        kind: "note",
        title: `Note by ${author}`,
        subtitle: note.content,
        timestamp: note.created_at,
      });
    });

    items.push({
      id: "tenant-created",
      kind: "created",
      title: "Tenant created",
      subtitle: `Started on the ${tenant.plan} plan`,
      timestamp: tenant.created_at,
    });

    items.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    return items;
  }, [transactions, notes, tenant]);

  const filtered = useMemo(() => {
    if (filter === "all") return events;
    if (filter === "money") {
      return events.filter((e) =>
        ["topup", "charge", "refund", "adjustment", "wallet_other"].includes(e.kind),
      );
    }
    if (filter === "note") return events.filter((e) => e.kind === "note");
    if (filter === "status") {
      return events.filter((e) => e.kind === "created" || e.kind === "plan");
    }
    return events;
  }, [events, filter]);

  const visible = filtered.slice(0, visibleCount);

  const grouped = useMemo(() => {
    const groups: Array<{ day: string; items: TimelineEvent[] }> = [];
    visible.forEach((ev) => {
      const key = dayKey(ev.timestamp);
      const last = groups[groups.length - 1];
      if (last && last.day === key) {
        last.items.push(ev);
      } else {
        groups.push({ day: key, items: [ev] });
      }
    });
    return groups;
  }, [visible]);

  return (
    <div className="pastel-card p-5 md:p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h2 className="text-[9px] uppercase tracking-[0.1em] font-black text-foreground/45 flex items-center gap-1.5">
          <Clock className="w-3 h-3" />
          Activity timeline
          {events.length > 0 && (
            <span className="ml-1 tabular-nums text-foreground/60">
              · {events.length}
            </span>
          )}
        </h2>
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-foreground/[0.04] ring-1 ring-foreground/[0.06]">
          <Filter className="w-3 h-3 text-foreground/35 ml-1.5 mr-0.5" />
          {FILTERS.map((btn) => (
            <button
              key={btn.value}
              type="button"
              onClick={() => {
                setFilter(btn.value);
                setVisibleCount(20);
              }}
              className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider transition-all",
                filter === btn.value
                  ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white shadow-sm shadow-violet-500/30 ring-1 ring-white/20"
                  : "text-foreground/55 hover:text-foreground",
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-foreground/40">
          <div className="w-12 h-12 rounded-2xl bg-foreground/5 flex items-center justify-center mb-3">
            <Clock className="w-5 h-5" />
          </div>
          <p className="text-sm font-medium">No events yet</p>
          <p className="text-xs text-foreground/35 mt-1">
            Transactions, notes, and status changes will show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((group) => (
            <div key={group.day}>
              <div className="sticky top-0 z-10 -mx-1 mb-2 flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-full bg-foreground/[0.06] backdrop-blur-md text-[9px] font-black uppercase tracking-wider text-foreground/60">
                  {formatDayHeader(group.day)}
                </span>
                <span className="text-[9px] font-black uppercase tracking-[0.1em] text-foreground/35 tabular-nums">
                  {group.items.length} {group.items.length === 1 ? "event" : "events"}
                </span>
                <div className="flex-1 h-px bg-foreground/[0.06]" />
              </div>

              <div className="relative pl-9">
                <div
                  aria-hidden
                  className="absolute left-[15px] top-1 bottom-1 w-px bg-gradient-to-b from-foreground/[0.08] via-foreground/[0.12] to-foreground/[0.04]"
                />

                <div className="space-y-1.5">
                  {group.items.map((event) => {
                    const meta = EVENT_META[event.kind];
                    const Icon = meta.icon;
                    return (
                      <div
                        key={event.id}
                        className="group relative flex items-start gap-3 rounded-2xl border border-foreground/[0.06] bg-foreground/[0.025] hover:bg-foreground/[0.04] transition-colors p-3"
                      >
                        <div
                          aria-hidden
                          className="absolute -left-[26px] top-4 w-2.5 h-2.5 rounded-full bg-background ring-2 ring-foreground/[0.12]"
                        />
                        <div
                          className={cn(
                            "w-8 h-8 rounded-xl flex items-center justify-center text-white ring-1 ring-white/20 shadow-sm shrink-0",
                            meta.tile,
                          )}
                        >
                          <Icon className="w-4 h-4" />
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={cn(
                                "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider",
                                meta.chip,
                              )}
                            >
                              {meta.label}
                            </span>
                            <p className="text-sm font-bold text-foreground truncate">
                              {event.title}
                            </p>
                          </div>
                          {event.subtitle && (
                            <p className="text-[11px] text-foreground/55 mt-1 font-medium line-clamp-2">
                              {event.subtitle}
                            </p>
                          )}
                          <p className="text-[10px] text-foreground/40 mt-1 font-medium tabular-nums">
                            {relativeTime(event.timestamp)}
                            <span className="mx-1.5 text-foreground/25">·</span>
                            {new Date(event.timestamp).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>

                        {event.amount && (
                          <div className="text-right shrink-0">
                            <p
                              className={cn(
                                "text-sm font-black tabular-nums leading-none",
                                meta.amount,
                              )}
                            >
                              {event.amount.sign}
                              {fmtCurrency(event.amount.value)}
                              <span className="text-[10px] font-bold opacity-50 ml-1">
                                IQD
                              </span>
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {visibleCount < filtered.length && (
            <div className="text-center pt-2">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + 20)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground/70 hover:text-foreground text-[11px] font-bold transition-colors"
              >
                Load more
                <span className="tabular-nums opacity-60">
                  ({filtered.length - visibleCount} remaining)
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
