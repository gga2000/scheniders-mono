"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Loader2,
  ScrollText,
  ChevronDown,
  Globe,
  Copy,
  Check,
  Download,
  Zap,
  Wallet,
  CreditCard,
  Ban,
  Play,
  Pause,
  Eye,
  Pencil,
  RefreshCw,
  Bell,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditEntry {
  id: string;
  admin_user_id: string | null;
  admin_label: string | null;
  actor_email: string | null;
  action: string;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  actor: {
    display_name: string;
    email: string | null;
    avatar_url: string | null;
    is_system: boolean;
  };
}

interface AuditLogTabProps {
  merchantId: string;
}

interface ActionMeta {
  icon: typeof Zap;
  label: string;
  category: "billing" | "status" | "security" | "config" | "comms";
  tone: string;
}

const actionRegistry: Record<string, ActionMeta> = {
  top_up_wallet: { icon: Wallet, label: "Top up", category: "billing", tone: "emerald" },
  topup: { icon: Wallet, label: "Top up", category: "billing", tone: "emerald" },
  adjust_balance: { icon: Wallet, label: "Balance adjust", category: "billing", tone: "emerald" },
  change_plan: { icon: CreditCard, label: "Plan change", category: "billing", tone: "violet" },
  plan_change: { icon: CreditCard, label: "Plan change", category: "billing", tone: "violet" },
  extend_trial: { icon: Sparkles, label: "Extend trial", category: "billing", tone: "amber" },
  extend_subscription: {
    icon: RefreshCw,
    label: "Extend subscription",
    category: "billing",
    tone: "violet",
  },
  auto_renew_toggle: {
    icon: RefreshCw,
    label: "Auto-renew",
    category: "billing",
    tone: "blue",
  },
  status_change: { icon: Zap, label: "Status change", category: "status", tone: "blue" },
  suspend_tenant: { icon: Ban, label: "Suspended", category: "status", tone: "rose" },
  reactivate_tenant: { icon: Play, label: "Reactivated", category: "status", tone: "emerald" },
  pause_tenant: { icon: Pause, label: "Paused", category: "status", tone: "amber" },
  unpause_tenant: { icon: Play, label: "Resumed", category: "status", tone: "emerald" },
  impersonate: { icon: Eye, label: "Impersonate", category: "security", tone: "rose" },
  add_note: { icon: Pencil, label: "Note added", category: "comms", tone: "blue" },
  mention_in_note: { icon: Bell, label: "Mention", category: "comms", tone: "violet" },
  send_notification: { icon: Bell, label: "Notification", category: "comms", tone: "blue" },
  bulk_action: { icon: Zap, label: "Bulk action", category: "config", tone: "blue" },
  export_data: { icon: Download, label: "Export", category: "security", tone: "blue" },
  update_settings: { icon: Pencil, label: "Settings", category: "config", tone: "violet" },
};

function metaFor(action: string): ActionMeta {
  return (
    actionRegistry[action] ?? {
      icon: ScrollText,
      label: action.replace(/_/g, " "),
      category: "config" as const,
      tone: "slate",
    }
  );
}

const toneClasses: Record<string, { chip: string; ring: string; iconBg: string }> = {
  emerald: {
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    ring: "ring-emerald-200 dark:ring-emerald-400/30",
    iconBg: "bg-gradient-to-br from-emerald-400 to-teal-500",
  },
  amber: {
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
    ring: "ring-amber-200 dark:ring-amber-400/30",
    iconBg: "bg-gradient-to-br from-amber-400 to-orange-500",
  },
  rose: {
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
    ring: "ring-rose-200 dark:ring-rose-400/30",
    iconBg: "bg-gradient-to-br from-rose-500 to-red-600",
  },
  violet: {
    chip: "bg-violet-100 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300",
    ring: "ring-violet-200 dark:ring-violet-400/30",
    iconBg: "bg-gradient-to-br from-violet-500 to-fuchsia-500",
  },
  blue: {
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
    ring: "ring-sky-200 dark:ring-sky-400/30",
    iconBg: "bg-gradient-to-br from-sky-400 to-blue-500",
  },
  slate: {
    chip: "bg-foreground/[0.06] text-foreground/60",
    ring: "ring-foreground/10",
    iconBg: "bg-foreground/40",
  },
};

const CATEGORIES = [
  { value: "all", label: "All" },
  { value: "billing", label: "Billing" },
  { value: "status", label: "Status" },
  { value: "security", label: "Security" },
  { value: "comms", label: "Comms" },
  { value: "config", label: "Config" },
] as const;

function fmtRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function dayKey(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function summarize(entry: AuditEntry): string {
  const d = entry.details ?? {};
  const parts: string[] = [];
  if (typeof d.amount === "number") parts.push(`${d.amount.toLocaleString("en-IQ")} IQD`);
  if (typeof d.plan === "string") parts.push(`→ ${d.plan}`);
  if (typeof d.status === "string") parts.push(`→ ${d.status}`);
  if (typeof d.days === "number") parts.push(`+${d.days}d`);
  if (typeof d.duration_days === "number") parts.push(`${d.duration_days}d duration`);
  if (typeof d.auto_renew === "boolean") parts.push(d.auto_renew ? "ON" : "OFF");
  if (typeof d.reason === "string" && d.reason) parts.push(`"${d.reason}"`);
  return parts.join(" · ");
}

function exportCSV(entries: AuditEntry[]): void {
  const header = "When,Actor,Action,Summary,IP,Details\n";
  const rows = entries
    .map((e) => {
      const cols = [
        new Date(e.created_at).toISOString(),
        e.actor.display_name,
        e.action,
        summarize(e),
        e.ip_address ?? "",
        JSON.stringify(e.details).replace(/"/g, '""'),
      ];
      return cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",");
    })
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function AuditLogTab({ merchantId }: AuditLogTabProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]["value"]>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [copiedIp, setCopiedIp] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<{
    logs: AuditEntry[];
    total: number;
  }>({
    queryKey: ["admin", "merchant", merchantId, "audit-log"],
    queryFn: async () => {
      const res = await fetch(`/api/merchants/${merchantId}/audit-log?limit=100`);
      if (!res.ok) throw new Error("Failed to fetch audit log");
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const entries = data?.logs ?? [];

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (category !== "all" && metaFor(e.action).category !== category) return false;
      if (search.trim()) {
        const hay = JSON.stringify(e).toLowerCase();
        if (!hay.includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [entries, category, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const e of filtered) {
      const k = dayKey(e.created_at);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopyIp = async (ip: string) => {
    try {
      await navigator.clipboard.writeText(ip);
      setCopiedIp(ip);
      setTimeout(() => setCopiedIp(null), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actions, reasons, details..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-foreground/[0.04] border border-transparent focus:border-foreground/20 outline-none text-xs"
          />
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-foreground/[0.04] hover:bg-foreground/[0.08] text-foreground/70 hover:text-foreground text-xs font-bold transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
          Refresh
        </button>
        <button
          type="button"
          onClick={() => exportCSV(filtered)}
          disabled={filtered.length === 0}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-foreground/[0.04] hover:bg-foreground/[0.08] text-foreground/70 hover:text-foreground text-xs font-bold transition-colors disabled:opacity-50"
          title="Export CSV"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-1 flex-wrap">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            type="button"
            onClick={() => setCategory(c.value)}
            className={cn(
              "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-colors",
              category === c.value
                ? "bg-foreground text-background"
                : "bg-foreground/[0.04] hover:bg-foreground/10 text-foreground/60"
            )}
          >
            {c.label}
          </button>
        ))}
        <span className="text-[10px] font-semibold text-foreground/40 ml-2">
          {filtered.length} {filtered.length === 1 ? "event" : "events"}
        </span>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-foreground/40">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="pastel-card flex flex-col items-center justify-center py-12 text-foreground/40">
          <ScrollText className="w-8 h-8 mb-2" />
          <p className="text-sm font-medium">No audit entries</p>
          <p className="text-xs mt-1">
            Admin actions on this merchant will appear here
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([day, items]) => (
            <div key={day}>
              <div className="sticky top-0 z-10 -mx-1 px-1 py-1 bg-background/90 backdrop-blur-sm flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-foreground/55">
                  {day}
                </span>
                <span className="text-[10px] text-foreground/35">
                  · {items.length} event{items.length === 1 ? "" : "s"}
                </span>
                <span className="flex-1 h-px bg-foreground/[0.06]" />
              </div>
              <div className="pastel-card p-1 mt-2 divide-y divide-[var(--card-border)]">
                {items.map((e) => {
                  const meta = metaFor(e.action);
                  const tone = toneClasses[meta.tone] ?? toneClasses.slate!;
                  const isOpen = expanded.has(e.id);
                  const Icon = meta.icon;
                  const summary = summarize(e);
                  return (
                    <div key={e.id} className="px-2 py-2.5">
                      <button
                        type="button"
                        onClick={() => toggleExpand(e.id)}
                        className="w-full flex items-center gap-3 text-left hover:bg-foreground/[0.02] rounded-xl p-1 -m-1 transition-colors"
                      >
                        {/* Avatar / icon */}
                        <div className="relative shrink-0">
                          {e.actor.avatar_url ? (
                            <img
                              src={e.actor.avatar_url}
                              alt=""
                              className="w-9 h-9 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className={cn(
                                "w-9 h-9 rounded-full ring-1 ring-white/20 shadow-sm flex items-center justify-center text-white text-xs font-black",
                                tone.iconBg
                              )}
                            >
                              {e.actor.display_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span
                            className={cn(
                              "absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full ring-2 ring-[var(--card-bg)] flex items-center justify-center",
                              tone.iconBg
                            )}
                          >
                            <Icon className="w-2.5 h-2.5 text-white" />
                          </span>
                        </div>

                        {/* Body */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-foreground truncate max-w-[140px]">
                              {e.actor.display_name}
                            </span>
                            <span
                              className={cn(
                                "px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider",
                                tone.chip
                              )}
                            >
                              {meta.label}
                            </span>
                            {summary && (
                              <span className="text-[11px] text-foreground/65 font-semibold truncate">
                                {summary}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-foreground/45">
                            <span title={new Date(e.created_at).toLocaleString()}>
                              {fmtRelative(e.created_at)}
                            </span>
                            {e.ip_address && (
                              <>
                                <span className="text-foreground/20">·</span>
                                <Globe className="w-2.5 h-2.5" />
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    void handleCopyIp(e.ip_address!);
                                  }}
                                  className="hover:text-foreground/70 transition-colors cursor-pointer"
                                  title="Click to copy IP"
                                >
                                  {e.ip_address}
                                </span>
                                {copiedIp === e.ip_address ? (
                                  <Check className="w-2.5 h-2.5 text-emerald-500" />
                                ) : (
                                  <Copy className="w-2.5 h-2.5 text-foreground/30" />
                                )}
                              </>
                            )}
                            {e.actor.is_system && (
                              <>
                                <span className="text-foreground/20">·</span>
                                <span className="font-bold uppercase tracking-wider text-foreground/40">
                                  system
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <ChevronDown
                          className={cn(
                            "w-3.5 h-3.5 text-foreground/30 transition-transform shrink-0",
                            isOpen && "rotate-180"
                          )}
                        />
                      </button>

                      {isOpen && (
                        <div className="mt-2 pl-12 space-y-1.5">
                          <div className="text-[10px] text-foreground/55">
                            <span className="font-bold uppercase tracking-wider">Performed at</span>
                            <span className="ml-2 tabular-nums">
                              {new Date(e.created_at).toLocaleString()}
                            </span>
                          </div>
                          {e.actor.email && (
                            <div className="text-[10px] text-foreground/55">
                              <span className="font-bold uppercase tracking-wider">Email</span>
                              <span className="ml-2">{e.actor.email}</span>
                            </div>
                          )}
                          {e.user_agent && (
                            <div className="text-[10px] text-foreground/55">
                              <span className="font-bold uppercase tracking-wider">UA</span>
                              <span className="ml-2 truncate inline-block max-w-[400px]">
                                {e.user_agent}
                              </span>
                            </div>
                          )}
                          <pre className="text-[10px] text-foreground/70 bg-foreground/[0.03] rounded-lg p-2 overflow-x-auto">
                            {JSON.stringify(e.details, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
