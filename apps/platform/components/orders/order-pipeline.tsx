"use client";

import { memo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { ChevronRight, ChevronUp, ChevronDown, RotateCcw, SlidersHorizontal, Users, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@scheniders/ui/popover";
import { Switch } from "@scheniders/ui/switch";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { useOrderPipelineLayout } from "@/hooks/use-order-pipeline-layout";
import {
    DEFAULT_PIPELINE_STAGES,
    PIPELINE_STAGE_IDS,
    PIPELINE_STAGE_REGISTRY,
    type PipelineStageId,
} from "@/lib/order-pipeline";

const ACTIVE_STAGE_SET = new Set<string>(DEFAULT_PIPELINE_STAGES);
const arraysEqual = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && a.every((v, i) => v === b[i]);

interface OrderPipelineProps {
    statusCounts: Record<string, number>;
    /** Current status filter — the matching stage is highlighted. */
    activeStatus?: string;
    /** Set the status filter. `undefined` clears it (back to "all"). */
    onSelectStatus: (status: string | undefined) => void;
    className?: string;
}

export const OrderPipeline = memo(function OrderPipeline({
    statusCounts,
    activeStatus,
    onSelectStatus,
    className,
}: OrderPipelineProps) {
    const { t } = useLanguage();
    const reduceMotion = useReducedMotion();
    const layout = useOrderPipelineLayout();

    const stages = layout.stages.map((id) => ({
        ...PIPELINE_STAGE_REGISTRY[id],
        count: statusCounts[id] || 0,
    }));
    const total = stages.reduce((sum, s) => sum + s.count, 0);
    // "active" only reads true when every shown stage is part of the active funnel;
    // once a terminal stage (Abandoned, Completed…) is added, switch to neutral "total".
    const allActive = layout.stages.every((id) => ACTIVE_STAGE_SET.has(id));

    return (
        <section
            className={cn(
                "orders-pipeline rounded-3xl border border-(--card-border) bg-(--card-bg) p-6",
                "shadow-[0_8px_30px_-12px_rgba(15,23,42,0.14)]",
                className
            )}
            aria-label={t("orders.pipeline.title", "Order pipeline")}
        >
            {/* Header */}
            <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-[12px] font-bold uppercase tracking-[0.16em] text-(--foreground-muted)">
                    {t("orders.pipeline.title", "Order Pipeline")}
                </h3>
                <div className="flex items-center gap-3">
                    <span className="text-[13px] text-(--foreground-muted)">
                        <span className="font-semibold text-foreground tabular-nums">{total.toLocaleString()}</span>{" "}
                        {allActive ? t("orders.pipeline.totalActive", "total active") : t("orders.pipeline.total", "total")}
                    </span>
                    <PipelineCustomizer layout={layout} statusCounts={statusCounts} />
                </div>
            </div>

            {/* Proportional segmented bar — each segment's width ∝ its share of shown orders */}
            {total === 0 ? (
                <div className="flex h-[66px] items-center justify-center rounded-[20px] border border-dashed border-(--card-border) text-sm text-(--foreground-subtle)">
                    {t("orders.pipeline.empty", "No orders in these stages")}
                </div>
            ) : (
                <div className="flex h-[66px] items-stretch overflow-hidden rounded-[20px] ring-1 ring-black/5">
                    {stages.map((s, i) => {
                        const isActive = activeStatus === s.id;
                        const dim = !!activeStatus && !isActive;
                        return (
                            <motion.button
                                key={s.id}
                                type="button"
                                layout={!reduceMotion}
                                initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1], delay: reduceMotion ? 0 : Math.min(i * 0.05, 0.3) }}
                                onClick={() => onSelectStatus(isActive ? undefined : s.id)}
                                aria-pressed={isActive}
                                title={`${t(s.labelKey, s.fallback)} · ${s.count.toLocaleString()}`}
                                // flexGrow ∝ count, floored so small/empty stages stay legible.
                                style={{ flexGrow: Math.max(s.count, total * 0.07), flexBasis: 0, backgroundColor: s.fill }}
                                className={cn(
                                    "group relative flex min-w-[92px] flex-col items-center justify-center px-3 text-center",
                                    "text-slate-800 outline-none transition-[filter,opacity] duration-300",
                                    "hover:z-10 hover:brightness-[1.03] focus-visible:z-10 focus-visible:brightness-[1.03]",
                                    i > 0 && "border-l border-white/35",
                                    isActive && "z-10 ring-2 ring-inset ring-slate-900/15",
                                    dim && "opacity-50 hover:opacity-100"
                                )}
                            >
                                <span className="text-[20px] font-extrabold leading-none tabular-nums">{s.count.toLocaleString()}</span>
                                <span className="mt-1 max-w-full truncate text-[11px] font-medium text-slate-700">
                                    {t(s.labelKey, s.fallback)}
                                </span>
                            </motion.button>
                        );
                    })}
                </div>
            )}

            {/* Legend — funnel flow, also clickable. Chevron only BETWEEN stages. */}
            <div className="mt-3.5 flex flex-wrap items-center gap-x-1 gap-y-1.5">
                {stages.map((s, i) => (
                    <div key={s.id} className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => onSelectStatus(activeStatus === s.id ? undefined : s.id)}
                            className={cn(
                                "inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-[13px] font-medium transition-colors",
                                activeStatus === s.id ? "text-foreground" : "text-(--foreground-muted) hover:text-foreground"
                            )}
                        >
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.fill }} aria-hidden />
                            {t(s.labelKey, s.fallback)}
                        </button>
                        {i < stages.length - 1 && (
                            <ChevronRight className="h-3.5 w-3.5 text-(--foreground-subtle)/70" aria-hidden />
                        )}
                    </div>
                ))}
            </div>
        </section>
    );
});

// ── Customizer ──────────────────────────────────────────────────────────────

function PipelineCustomizer({
    layout,
    statusCounts,
}: {
    layout: ReturnType<typeof useOrderPipelineLayout>;
    statusCounts: Record<string, number>;
}) {
    const { t } = useLanguage();
    const { toast } = useToast();
    const [open, setOpen] = useState(false);

    const included = layout.stages;
    const includedSet = new Set<string>(included);
    const excluded = PIPELINE_STAGE_IDS.filter((id) => !includedSet.has(id));

    // The tenant-wide baseline (built-in default until an admin sets one).
    const teamDefault = layout.orgDefault ?? DEFAULT_PIPELINE_STAGES;
    const teamDefaultSet = new Set<string>(teamDefault);
    const matchesTeamDefault = arraysEqual(included, teamDefault);

    const toggle = (id: PipelineStageId) => {
        if (includedSet.has(id)) {
            if (included.length <= 1) return; // keep at least one stage
            layout.setLocalStages(included.filter((s) => s !== id));
        } else {
            layout.setLocalStages([...included, id]);
        }
    };

    const move = (id: PipelineStageId, dir: -1 | 1) => {
        const idx = included.indexOf(id);
        const next = idx + dir;
        if (idx < 0 || next < 0 || next >= included.length) return;
        const reordered = [...included];
        [reordered[idx], reordered[next]] = [reordered[next], reordered[idx]];
        layout.setLocalStages(reordered);
    };

    const saveForTeam = async () => {
        try {
            await layout.saveAsTeamDefault(included);
            toast({ variant: "success", title: t("orders.pipeline.savedDefault", "Saved as team default") });
            setOpen(false);
        } catch (err) {
            toast({
                variant: "error",
                title: err instanceof Error ? err.message : t("orders.pipeline.saveFailed", "Failed to save"),
            });
        }
    };

    const row = (id: PipelineStageId, isIncluded: boolean) => {
        const meta = PIPELINE_STAGE_REGISTRY[id];
        const idx = included.indexOf(id);
        return (
            <div key={id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/40">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: meta.fill }} aria-hidden />
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                    <span className="truncate text-sm text-foreground">{t(meta.labelKey, meta.fallback)}</span>
                    {teamDefaultSet.has(id) && (
                        <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-(--foreground-subtle)">
                            {t("orders.pipeline.defaultBadge", "Default")}
                        </span>
                    )}
                </span>
                <span className="text-xs tabular-nums text-(--foreground-subtle)">{(statusCounts[id] || 0).toLocaleString()}</span>
                {isIncluded && (
                    <span className="flex items-center">
                        <button
                            type="button"
                            onClick={() => move(id, -1)}
                            disabled={idx <= 0}
                            className="rounded p-0.5 text-(--foreground-subtle) hover:text-foreground disabled:opacity-30"
                            title={t("orders.pipeline.moveUp", "Move up")}
                        >
                            <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                            type="button"
                            onClick={() => move(id, 1)}
                            disabled={idx >= included.length - 1}
                            className="rounded p-0.5 text-(--foreground-subtle) hover:text-foreground disabled:opacity-30"
                            title={t("orders.pipeline.moveDown", "Move down")}
                        >
                            <ChevronDown className="h-4 w-4" />
                        </button>
                    </span>
                )}
                <Switch
                    checked={isIncluded}
                    onCheckedChange={() => toggle(id)}
                    aria-label={t(meta.labelKey, meta.fallback)}
                />
            </div>
        );
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg border border-(--card-border) text-(--foreground-muted) transition-colors",
                        "hover:bg-muted/60 hover:text-foreground",
                        open && "bg-muted/60 text-foreground"
                    )}
                    title={t("orders.pipeline.customize", "Customize pipeline")}
                    aria-label={t("orders.pipeline.customize", "Customize pipeline")}
                >
                    <SlidersHorizontal className="h-4 w-4" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="end"
                sideOffset={8}
                collisionPadding={16}
                className="z-60 w-72 overflow-hidden rounded-2xl border border-(--card-border) bg-(--card-bg) p-0 text-foreground shadow-[0_24px_60px_-15px_rgba(15,23,42,0.35)]"
            >
                <div className="border-b border-(--card-border) px-4 py-3">
                    <p className="text-sm font-semibold text-foreground">
                        {t("orders.pipeline.customize", "Customize pipeline")}
                    </p>
                    <p className="mt-0.5 text-xs text-(--foreground-muted)">
                        {t("orders.pipeline.customizeHint", "Pick the stages to show, drag with the arrows to reorder.")}
                    </p>
                </div>

                <div className="max-h-[320px] overflow-y-auto p-2">
                    {included.map((id) => row(id, true))}
                    {excluded.length > 0 && (
                        <>
                            <div className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-(--foreground-subtle)">
                                {t("orders.pipeline.moreStages", "More stages")}
                            </div>
                            {excluded.map((id) => row(id, false))}
                        </>
                    )}
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-(--card-border) px-3 py-2.5">
                    <button
                        type="button"
                        onClick={layout.resetToDefault}
                        disabled={!layout.hasLocalOverride}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-(--foreground-muted) transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-40"
                    >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {t("orders.pipeline.reset", "Reset")}
                    </button>
                    {layout.canSetDefault && (
                        <button
                            type="button"
                            onClick={saveForTeam}
                            disabled={layout.isSavingDefault || matchesTeamDefault}
                            title={matchesTeamDefault ? t("orders.pipeline.saveDisabledHint", "Already the team default") : undefined}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-50 dark:bg-primary dark:text-(--primary-fg)"
                        >
                            {layout.isSavingDefault ? (
                                <Check className="h-3.5 w-3.5 animate-pulse" />
                            ) : (
                                <Users className="h-3.5 w-3.5" />
                            )}
                            {t("orders.pipeline.saveDefault", "Save for team")}
                        </button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
