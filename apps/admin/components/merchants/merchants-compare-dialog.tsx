"use client";

import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@scheniders/ui/dialog";
import {
  Wallet,
  TrendingUp,
  ShoppingBag,
  Activity,
  MapPin,
  Calendar,
  X,
  ArrowUpRight,
  Trophy,
  Minus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminTenant } from "@/types/admin";

interface MerchantsCompareDialogProps {
  open: boolean;
  merchants: AdminTenant[];
  onClose: () => void;
  onOpenDetail?: (id: string) => void;
}

const STATUS_GRADIENTS: Record<string, string> = {
  active: "from-emerald-400 to-teal-500 shadow-emerald-500/30",
  trial: "from-amber-400 to-orange-500 shadow-amber-500/30",
  suspended: "from-rose-500 to-red-600 shadow-rose-500/40",
  cancelled: "from-slate-400 to-slate-500 shadow-slate-500/20",
};

const PLAN_GRADIENTS: Record<string, string> = {
  starter: "from-sky-400 to-cyan-500 shadow-sky-500/30",
  growth: "from-emerald-400 to-teal-500 shadow-emerald-500/30",
  professional: "from-violet-500 to-fuchsia-500 shadow-violet-500/30",
  enterprise: "from-amber-400 to-orange-500 shadow-amber-500/30",
};

function fmtCompactIQD(amount: number): string {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K`;
  return String(amount);
}

function daysSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
}

function lastActiveText(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const d = daysSince(dateStr);
  if (d === null) return "—";
  if (d === 0) return "Today";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${d}d ago`;
  return "30d+ ago";
}

interface MetricRow {
  key: string;
  label: string;
  icon: typeof Wallet;
  values: number[];
  format: (n: number) => string;
  bestIs: "high" | "low" | "none";
  suffix?: string;
}

export function MerchantsCompareDialog({
  open,
  merchants,
  onClose,
  onOpenDetail,
}: MerchantsCompareDialogProps) {
  const rows: MetricRow[] = useMemo(() => {
    return [
      {
        key: "balance",
        label: "Balance",
        icon: Wallet,
        values: merchants.map((m) => m.wallet?.balance_iqd ?? 0),
        format: (n) => fmtCompactIQD(n),
        suffix: "IQD",
        bestIs: "high",
      },
      {
        key: "revenue",
        label: "MRR",
        icon: TrendingUp,
        values: merchants.map(
          (m) => (m as { monthly_revenue?: number }).monthly_revenue ?? 0
        ),
        format: (n) => fmtCompactIQD(n),
        suffix: "IQD/mo",
        bestIs: "high",
      },
      {
        key: "orders",
        label: "Orders",
        icon: ShoppingBag,
        values: merchants.map(
          (m) =>
            (m as { usage?: { orders_count?: number } }).usage?.orders_count ?? 0
        ),
        format: (n) => new Intl.NumberFormat("en-IQ").format(n),
        bestIs: "high",
      },
    ];
  }, [merchants]);

  if (merchants.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="md:max-w-5xl"
        aria-describedby={undefined}
      >
        <DialogTitle className="sr-only">Compare merchants</DialogTitle>

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white flex items-center justify-center shadow-md shadow-violet-500/30 ring-1 ring-white/20">
              <Activity className="w-4 h-4" />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em] font-black text-foreground/50">
                Compare
              </p>
              <h2 className="text-lg font-black tracking-tight text-foreground">
                {merchants.length} merchants side by side
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-foreground/40 hover:text-foreground hover:bg-foreground/5 transition-colors"
            aria-label="Close compare"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Merchant header tiles */}
        <div
          className="grid gap-3 mb-5"
          style={{
            gridTemplateColumns: `120px repeat(${merchants.length}, minmax(0, 1fr))`,
          }}
        >
          <div />
          {merchants.map((m) => {
            const logoBg = m.branding?.primary_color || "#1E1E1E";
            const planGrad = PLAN_GRADIENTS[m.plan] ?? "from-slate-400 to-slate-500";
            const statusGrad =
              STATUS_GRADIENTS[
                (m as { status?: string }).status ?? ""
              ] ?? "from-slate-400 to-slate-500";
            return (
              <div
                key={m.id}
                className="rounded-2xl border border-foreground/[0.06] bg-foreground/[0.02] p-3 relative"
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-base shrink-0 ring-1 ring-black/5"
                    style={{ backgroundColor: logoBg }}
                  >
                    {m.business_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-foreground truncate leading-tight">
                      {m.business_name}
                    </p>
                    <p className="text-[10px] text-foreground/50 truncate font-medium">
                      {m.slug}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 mt-2.5 flex-wrap">
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white ring-1 ring-white/20 shadow-sm bg-gradient-to-br",
                      statusGrad
                    )}
                  >
                    {(m as { status?: string }).status}
                  </span>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider text-white ring-1 ring-white/20 shadow-sm bg-gradient-to-br",
                      planGrad
                    )}
                  >
                    {m.plan}
                  </span>
                </div>
                {onOpenDetail && (
                  <button
                    type="button"
                    onClick={() => {
                      onOpenDetail(m.id);
                      onClose();
                    }}
                    className="absolute top-2 right-2 p-1 rounded-lg text-foreground/30 hover:text-foreground hover:bg-foreground/5 transition-colors"
                    title="Open details"
                  >
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Metric rows */}
        <div className="space-y-1.5">
          {rows.map((row) => {
            const Icon = row.icon;
            const max = Math.max(...row.values, 0);
            const min = Math.min(...row.values);
            return (
              <div
                key={row.key}
                className="grid gap-3 items-center py-2 border-t border-foreground/[0.04]"
                style={{
                  gridTemplateColumns: `120px repeat(${merchants.length}, minmax(0, 1fr))`,
                }}
              >
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-black text-foreground/55">
                  <Icon className="w-3.5 h-3.5 text-foreground/40" />
                  {row.label}
                </div>
                {row.values.map((v, i) => {
                  const isBest =
                    row.bestIs === "high"
                      ? v === max && max > 0
                      : row.bestIs === "low"
                        ? v === min && merchants.length > 1
                        : false;
                  const isWorst =
                    row.bestIs === "high"
                      ? v === min && merchants.length > 1 && max !== min
                      : row.bestIs === "low"
                        ? v === max && merchants.length > 1 && max !== min
                        : false;
                  return (
                    <div
                      key={i}
                      className={cn(
                        "rounded-xl px-3 py-2 flex items-center gap-1.5 relative",
                        isBest &&
                          "bg-emerald-50 dark:bg-emerald-400/10 ring-1 ring-emerald-200 dark:ring-emerald-400/30",
                        isWorst &&
                          "bg-rose-50 dark:bg-rose-400/10 ring-1 ring-rose-200 dark:ring-rose-400/30",
                        !isBest && !isWorst && "bg-foreground/[0.02]"
                      )}
                    >
                      {isBest && (
                        <Trophy className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      )}
                      {isWorst && (
                        <Minus className="w-3 h-3 text-rose-600 dark:text-rose-400 shrink-0" />
                      )}
                      <span className="text-sm font-black text-foreground tabular-nums">
                        {row.format(v)}
                      </span>
                      {row.suffix && (
                        <span className="text-[9px] font-bold text-foreground/40">
                          {row.suffix}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Non-numeric rows */}
          <CompareInfoRow
            label="City"
            icon={MapPin}
            merchants={merchants}
            getter={(m) => m.city ?? "—"}
          />
          <CompareInfoRow
            label="Last Active"
            icon={Activity}
            merchants={merchants}
            getter={(m) => lastActiveText(m.last_active_at)}
          />
          <CompareInfoRow
            label="Joined"
            icon={Calendar}
            merchants={merchants}
            getter={(m) => {
              const d = daysSince(m.created_at);
              return d === null ? "—" : `${d}d ago`;
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CompareInfoRow({
  label,
  icon: Icon,
  merchants,
  getter,
}: {
  label: string;
  icon: typeof Wallet;
  merchants: AdminTenant[];
  getter: (m: AdminTenant) => string;
}) {
  return (
    <div
      className="grid gap-3 items-center py-2 border-t border-foreground/[0.04]"
      style={{
        gridTemplateColumns: `120px repeat(${merchants.length}, minmax(0, 1fr))`,
      }}
    >
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider font-black text-foreground/55">
        <Icon className="w-3.5 h-3.5 text-foreground/40" />
        {label}
      </div>
      {merchants.map((m) => (
        <div
          key={m.id}
          className="rounded-xl px-3 py-2 bg-foreground/[0.02] text-sm font-bold text-foreground truncate"
        >
          {getter(m)}
        </div>
      ))}
    </div>
  );
}
