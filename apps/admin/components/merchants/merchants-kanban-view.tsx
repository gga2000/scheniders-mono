"use client";

import { useState, useMemo, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  CheckCircle2,
  Ban,
  XCircle,
  PauseCircle,
  Wallet,
  TrendingUp,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { planLabel, type AdminTenant, type TenantStatus } from "@/types/admin";
import { formatCount, formatIQD } from "@/lib/format";
import { useMerchantsStats } from "@/hooks/use-merchants-stats";
import { useCan } from "@/hooks/use-admin-auth";
import { STATUS_REFUSALS, stageMoveNote, statusLandedText, statusPickRefusal, statusPickSaves } from "@/lib/shop-status-choice";
import { adminFetch } from "@/lib/admin-fetch";

type StageKey = TenantStatus;

interface Stage {
  key: StageKey;
  label: string;
  description: string;
  icon: typeof Sparkles;
  gradient: string;
  bg: string;
  border: string;
  dot: string;
}

/**
 * One column per status, so every shop is on the board. Keyed by status, so a
 * status added to `TenantStatus` cannot be left without a column.
 */
const STAGE_BY_STATUS: Record<TenantStatus, Stage> = {
  trial: {
    key: "trial",
    label: "Trial",
    description: "Evaluating",
    icon: Sparkles,
    gradient: "from-amber-400 to-orange-500",
    bg: "bg-gradient-to-br from-amber-50/60 to-orange-50/60 dark:from-amber-400/5 dark:to-orange-400/5",
    border: "border-amber-200 dark:border-amber-400/20",
    dot: "bg-amber-500",
  },
  active: {
    key: "active",
    label: "Active",
    // Not "Paying": our own never-billed shop, the demo store and a shop whose
    // month is unpaid are all active too. Each card's plan pill says which.
    description: "Store open",
    icon: CheckCircle2,
    gradient: "from-emerald-400 to-teal-500",
    bg: "bg-gradient-to-br from-emerald-50/60 to-teal-50/60 dark:from-emerald-400/5 dark:to-teal-400/5",
    border: "border-emerald-200 dark:border-emerald-400/20",
    dot: "bg-emerald-500",
  },
  limited: {
    key: "limited",
    label: "Paused",
    description: "Resume from the shop page",
    icon: PauseCircle,
    gradient: "from-yellow-400 to-amber-500",
    bg: "bg-gradient-to-br from-yellow-50/60 to-amber-50/60 dark:from-yellow-400/5 dark:to-amber-400/5",
    border: "border-yellow-200 dark:border-yellow-400/20",
    dot: "bg-yellow-500",
  },
  suspended: {
    key: "suspended",
    label: "On hold",
    description: "Action needed",
    icon: Ban,
    gradient: "from-rose-500 to-red-600",
    bg: "bg-gradient-to-br from-rose-50/60 to-red-50/60 dark:from-rose-400/5 dark:to-red-400/5",
    border: "border-rose-200 dark:border-rose-400/20",
    dot: "bg-rose-500",
  },
  cancelled: {
    key: "cancelled",
    label: "Cancelled",
    description: "Lost",
    icon: XCircle,
    gradient: "from-slate-400 to-slate-500",
    bg: "bg-gradient-to-br from-slate-50/60 to-slate-100/60 dark:from-slate-400/5 dark:to-slate-500/5",
    border: "border-slate-200 dark:border-slate-400/20",
    dot: "bg-slate-400",
  },
};

const STAGES = Object.values(STAGE_BY_STATUS);

/**
 * A pause is set and lifted on the shop page (Pause, "Lift the pause now"),
 * which keeps its end date and what it blocks; the database refuses a plain
 * status change to or from it. So paused shops are shown here but not dragged
 * in or out.
 */
const isPaused = (status: StageKey) => status === "limited";

/** Our own shops in slate; every plan a shop pays for (Start, Team, Business, Custom) in sky, its letter telling which. */
const planGradient = (plan: string) => (plan === "internal" ? "from-slate-400 to-slate-500" : "from-sky-400 to-cyan-500");

interface MerchantsKanbanViewProps {
  merchants: AdminTenant[];
  onOpenDetail?: (id: string) => void;
}

export function MerchantsKanbanView({
  merchants,
  onOpenDetail,
}: MerchantsKanbanViewProps) {
  const queryClient = useQueryClient();
  // Moving a card changes the shop's status (PATCH, change_plan); without it
  // the cards stay put instead of ending in a refusal.
  const canMove = useCan()("change_plan");
  // Column totals are counted by the server over every matching shop; the
  // cards are the pages of the list loaded so far.
  const { data: stats } = useMerchantsStats();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverCol, setHoverCol] = useState<StageKey | null>(null);
  const [pendingMove, setPendingMove] = useState<{
    id: string;
    name: string;
    from: StageKey;
    /** The column it was dropped on. */
    to: StageKey;
    /** What the server will save: a trial never paid dropped on Active goes back to Trial. */
    saves: TenantStatus;
    trialEndsAt: string | null;
  } | null>(null);

  const buckets = useMemo(() => {
    const byStage = new Map<StageKey, AdminTenant[]>();
    for (const stage of STAGES) byStage.set(stage.key, []);
    for (const m of merchants) {
      const status = m.status;
      const bucket = byStage.get(status);
      if (bucket) bucket.push(m);
    }
    return byStage;
  }, [merchants]);

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TenantStatus }) => {
      const res = await adminFetch(`/api/merchants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Status change failed");
      }
      return res.json();
    },
    onSuccess: (answer, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "merchants"] });
      // A held trial that was never paid comes back as Trial when Active is picked.
      const landed = statusLandedText(status, answer);
      if (landed) toast.info(landed);
    },
    // The server says why a move was refused (a trial, the demo store).
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleDragStart = useCallback(
    (e: React.DragEvent, m: AdminTenant) => {
      setDraggingId(m.id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", m.id);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setHoverCol(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, target: StageKey) => {
      e.preventDefault();
      const id = e.dataTransfer.getData("text/plain");
      const merchant = merchants.find((m) => m.id === id);
      if (!merchant) return;
      const from = merchant.status;
      if (from === target || isPaused(from) || isPaused(target)) {
        setHoverCol(null);
        setDraggingId(null);
        return;
      }
      const shop = { status: from, trial_payment: merchant.trial_payment ?? "paid" } as const;
      const refusal = statusPickRefusal(shop, target);
      if (refusal) {
        // Said before a confirm that the server would only refuse.
        toast.error(STATUS_REFUSALS[refusal]);
        setHoverCol(null);
        setDraggingId(null);
        return;
      }
      setPendingMove({
        id,
        name: merchant.business_name,
        from,
        to: target,
        saves: statusPickSaves(shop, target),
        trialEndsAt: merchant.trial_ends_at,
      });
      setHoverCol(null);
      setDraggingId(null);
    },
    [merchants]
  );

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3">
        {STAGES.map((stage) => {
          const Icon = stage.icon;
          const items = buckets.get(stage.key) ?? [];
          const total = stats ? stats.status[stage.key] : null;
          const notLoaded = total === null ? 0 : Math.max(total - items.length, 0);
          const isHover = hoverCol === stage.key;

          return (
            <div
              key={stage.key}
              onDragOver={(e) => {
                if (isPaused(stage.key)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setHoverCol(stage.key);
              }}
              onDragLeave={(e) => {
                if ((e.target as HTMLElement).contains(e.relatedTarget as Node))
                  return;
                setHoverCol((c) => (c === stage.key ? null : c));
              }}
              onDrop={(e) => handleDrop(e, stage.key)}
              className={cn(
                "rounded-2xl border p-3 transition-all flex flex-col min-h-[400px]",
                stage.bg,
                stage.border,
                isHover && "ring-2 ring-violet-400 ring-offset-2 ring-offset-[var(--background)] scale-[1.01]"
              )}
            >
              {/* Column header */}
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 ring-1 ring-white/20 shadow-sm bg-gradient-to-br",
                      stage.gradient
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-foreground tracking-tight leading-none">
                      {stage.label}
                    </p>
                    <p className="text-xs text-foreground/70 font-medium mt-0.5">
                      {stage.description}
                    </p>
                  </div>
                </div>
                <span className="text-xs font-black text-foreground/70 tabular-nums px-2 py-0.5 rounded-full bg-foreground/[0.06]">
                  {total === null ? "—" : formatCount(total)}
                </span>
              </div>

              {/* Cards */}
              <div className="space-y-2 flex-1 overflow-y-auto scrollbar-hide pr-0.5">
                {items.length === 0 && notLoaded === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full mb-2",
                        stage.dot,
                        "opacity-30"
                      )}
                    />
                    <p className="text-xs text-foreground/70 font-medium">
                      Empty
                    </p>
                    {isHover && (
                      <p className="text-xs text-violet-600 dark:text-violet-400 font-bold mt-1">
                        Drop here
                      </p>
                    )}
                  </div>
                ) : (
                  items.map((m) => (
                    <KanbanCard
                      key={m.id}
                      merchant={m}
                      canDrag={canMove && !isPaused(stage.key)}
                      isDragging={draggingId === m.id}
                      onDragStart={(e) => handleDragStart(e, m)}
                      onDragEnd={handleDragEnd}
                      onClick={() => onOpenDetail?.(m.id)}
                    />
                  ))
                )}
                {notLoaded > 0 && (
                  <p className="text-[13px] text-foreground/70 text-center py-2">
                    {formatCount(notLoaded)} more not loaded yet. Scroll down to load them.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation modal for cross-stage moves */}
      <AnimatePresence>
        {pendingMove && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={() => setPendingMove(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[var(--card-bg)] rounded-3xl shadow-2xl border border-[var(--card-border)] p-5 max-w-sm w-full mx-4"
            >
              <p className="text-xs font-black text-foreground/70 mb-2">
                Confirm Stage Change
              </p>
              <p className="text-sm font-black text-foreground tracking-tight mb-4 leading-snug">
                Move <span className="text-violet-600 dark:text-violet-400">{pendingMove.name}</span> from{" "}
                {STAGES.find((s) => s.key === pendingMove.from)?.label} to{" "}
                {STAGES.find((s) => s.key === pendingMove.saves)?.label}?
              </p>
              <div className="flex items-center gap-2 mb-5">
                {(() => {
                  const fromStage = STAGES.find((s) => s.key === pendingMove.from);
                  const toStage = STAGES.find((s) => s.key === pendingMove.saves);
                  if (!fromStage || !toStage) return null;
                  const FromIcon = fromStage.icon;
                  const ToIcon = toStage.icon;
                  return (
                    <>
                      <span
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-black text-white ring-1 ring-white/20 shadow-sm bg-gradient-to-br flex items-center gap-1",
                          fromStage.gradient
                        )}
                      >
                        <FromIcon className="w-3 h-3" />
                        {fromStage.label}
                      </span>
                      <ArrowRight className="w-4 h-4 text-foreground/40 shrink-0" />
                      <span
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-black text-white ring-1 ring-white/20 shadow-sm bg-gradient-to-br flex items-center gap-1",
                          toStage.gradient
                        )}
                      >
                        <ToIcon className="w-3 h-3" />
                        {toStage.label}
                      </span>
                    </>
                  );
                })()}
              </div>
              <p className="text-xs text-foreground/70 mb-4 leading-snug">
                {stageMoveNote(pendingMove.to, pendingMove.saves, pendingMove.trialEndsAt, new Date())}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    // The status the confirm names: if the trial was paid
                    // meanwhile, the server refuses Trial and says why.
                    statusMutation.mutate({
                      id: pendingMove.id,
                      status: pendingMove.saves,
                    });
                    setPendingMove(null);
                  }}
                  disabled={statusMutation.isPending}
                  className={cn(
                    "flex-1 px-4 py-2.5 rounded-xl text-xs font-black text-white shadow-sm ring-1 ring-white/20 transition-all bg-gradient-to-br hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50",
                    STAGES.find((s) => s.key === pendingMove.saves)?.gradient ??
                      "from-foreground to-foreground"
                  )}
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setPendingMove(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

interface KanbanCardProps {
  merchant: AdminTenant;
  canDrag: boolean;
  isDragging: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
}

function KanbanCard({
  merchant,
  canDrag,
  isDragging,
  onDragStart,
  onDragEnd,
  onClick,
}: KanbanCardProps) {
  const logoBg = merchant.branding?.primary_color || "#1E1E1E";
  const balance = merchant.wallet?.balance_iqd ?? 0;

  const plan = planLabel(merchant.plan);

  return (
    <div
      draggable={canDrag}
      onDragStart={canDrag ? onDragStart : undefined}
      onDragEnd={canDrag ? onDragEnd : undefined}
      onClick={onClick}
      className={cn(
        "group relative rounded-xl bg-[var(--card-bg)] border border-foreground/[0.06] p-2.5 shadow-[0_1px_4px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.12)] hover:-translate-y-0.5 transition-all",
        canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        isDragging && "opacity-40 scale-95"
      )}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0 ring-1 ring-black/5"
          style={{ backgroundColor: logoBg }}
        >
          {merchant.business_name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-black text-foreground truncate name-dir leading-tight" title={merchant.business_name}>
            {merchant.business_name}
          </p>
          <p className="text-xs text-foreground/70 truncate font-medium" title={merchant.slug}>
            {merchant.slug}
          </p>
        </div>
        <span
          className={cn(
            "px-1.5 py-0.5 rounded-full text-xs font-black text-white ring-1 ring-white/20 shadow-sm bg-gradient-to-br shrink-0",
            planGradient(merchant.plan)
          )}
          title={plan}
        >
          {plan.charAt(0).toUpperCase()}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs text-foreground/70 font-medium tabular-nums">
        <span className="flex items-center gap-1">
          <Wallet className="w-2.5 h-2.5 text-foreground/35" />
          {formatIQD(balance)}
        </span>
        <span className="w-0.5 h-0.5 rounded-full bg-foreground/20" />
        <span className="flex items-center gap-1" title="Our fees, last 30 days">
          <TrendingUp className="w-2.5 h-2.5 text-foreground/35" />
          {formatIQD(merchant.fees_30d)} fees
        </span>
      </div>
    </div>
  );
}
