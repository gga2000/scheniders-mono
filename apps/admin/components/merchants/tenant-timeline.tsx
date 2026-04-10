"use client";

import { useState, useMemo } from "react";
import {
  ShoppingBag,
  Wallet,
  CreditCard,
  ArrowUpCircle,
  StickyNote,
  AlertTriangle,
  Check,
  Clock,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

type EventType = "order" | "wallet" | "plan" | "note" | "status";

interface TimelineEvent {
  id: string;
  type: EventType;
  title: string;
  description?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

const EVENT_CONFIG: Record<EventType, { icon: React.ReactNode; color: string; bg: string }> = {
  order: {
    icon: <ShoppingBag className="w-3.5 h-3.5" />,
    color: "text-blue-600",
    bg: "bg-blue-100 dark:bg-blue-400/15",
  },
  wallet: {
    icon: <Wallet className="w-3.5 h-3.5" />,
    color: "text-green-600",
    bg: "bg-green-100 dark:bg-green-400/15",
  },
  plan: {
    icon: <ArrowUpCircle className="w-3.5 h-3.5" />,
    color: "text-purple-600",
    bg: "bg-purple-100 dark:bg-purple-400/15",
  },
  note: {
    icon: <StickyNote className="w-3.5 h-3.5" />,
    color: "text-amber-600",
    bg: "bg-amber-100 dark:bg-amber-400/15",
  },
  status: {
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
    color: "text-red-600",
    bg: "bg-red-100 dark:bg-red-400/15",
  },
};

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

export function TenantTimeline({ transactions, notes, tenant }: TenantTimelineProps) {
  const [filter, setFilter] = useState<EventType | "all">("all");
  const [visibleCount, setVisibleCount] = useState(20);

  const events = useMemo(() => {
    const items: TimelineEvent[] = [];

    // Wallet transactions
    transactions.forEach((tx) => {
      items.push({
        id: `tx-${tx.id}`,
        type: "wallet",
        title: tx.type === "topup" ? "Wallet Top-Up" : tx.type === "charge" ? "Wallet Charge" : `Wallet ${tx.type}`,
        description: `${new Intl.NumberFormat("en-IQ").format(tx.amount_iqd)} IQD${tx.description ? ` — ${tx.description}` : ""}`,
        timestamp: tx.created_at,
      });
    });

    // Notes
    notes.forEach((note) => {
      items.push({
        id: `note-${note.id}`,
        type: "note",
        title: "Admin Note",
        description: note.content.slice(0, 120) + (note.content.length > 120 ? "..." : ""),
        timestamp: note.created_at,
      });
    });

    // Tenant creation
    items.push({
      id: "created",
      type: "status",
      title: "Tenant Created",
      description: `Plan: ${tenant.plan}`,
      timestamp: tenant.created_at,
    });

    // Sort by date descending
    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return items;
  }, [transactions, notes, tenant]);

  const filtered = filter === "all" ? events : events.filter((e) => e.type === filter);
  const visible = filtered.slice(0, visibleCount);

  const filterButtons: Array<{ value: EventType | "all"; label: string }> = [
    { value: "all", label: "All" },
    { value: "order", label: "Orders" },
    { value: "wallet", label: "Wallet" },
    { value: "plan", label: "Plan" },
    { value: "note", label: "Notes" },
    { value: "status", label: "Status" },
  ];

  return (
    <div className="pastel-card p-5 md:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-foreground/60 uppercase tracking-wider flex items-center gap-2">
          <Clock className="w-4 h-4" />
          Timeline
        </h2>
        <div className="flex items-center gap-1">
          <Filter className="w-3 h-3 text-foreground/30" />
          {filterButtons.map((btn) => (
            <button
              key={btn.value}
              onClick={() => { setFilter(btn.value); setVisibleCount(20); }}
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-medium transition-colors",
                filter === btn.value
                  ? "bg-foreground text-background"
                  : "text-foreground/40 hover:text-foreground/70",
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-12 text-foreground/40 text-sm">
          No events to display
        </div>
      ) : (
        <div className="relative">
          {/* Timeline line */}
          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-[var(--card-border)]" />

          <div className="space-y-0">
            {visible.map((event) => {
              const config = EVENT_CONFIG[event.type];
              return (
                <div key={event.id} className="relative flex items-start gap-3 py-3">
                  {/* Dot */}
                  <div className={cn("w-[30px] h-[30px] rounded-full flex items-center justify-center shrink-0 z-10", config.bg, config.color)}>
                    {config.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm font-semibold text-foreground">{event.title}</p>
                    {event.description && (
                      <p className="text-xs text-foreground/50 mt-0.5 truncate">{event.description}</p>
                    )}
                    <p className="text-[10px] text-foreground/30 mt-1">
                      {new Date(event.timestamp).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Load more */}
          {visibleCount < filtered.length && (
            <div className="text-center mt-4">
              <button
                onClick={() => setVisibleCount((c) => c + 20)}
                className="text-xs font-semibold text-foreground/50 hover:text-foreground transition-colors"
              >
                Load more ({filtered.length - visibleCount} remaining)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
