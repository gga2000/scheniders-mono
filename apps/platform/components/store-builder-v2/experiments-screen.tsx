"use client";

// =====================================================================
// ExperimentsScreen — settings screen for `config.experiments`
// =====================================================================
// Lists experiments grouped by status (Running / Paused / Draft /
// Completed) with quick actions (pause, stop & promote winner, view).
// Editing an experiment opens a right-pane editor with name, primary
// metric, dates, arms (with traffic_pct sum-to-100 validation), and
// status. Viewing an experiment loads live stats from
// `store_config_experiment_events` and renders per-arm metrics + a
// simple two-sample z-test vs the control arm.
// =====================================================================

import {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type ReactElement,
} from "react";
import {
    AlertCircle,
    BarChart3,
    Check,
    ChevronLeft,
    Eye,
    Loader2,
    Pause,
    Play,
    Plus,
    RefreshCw,
    StopCircle,
    Trash2,
    Trophy,
    X,
} from "lucide-react";
import type {
    Experiment,
    ExperimentArm,
} from "@scheniders/shared";
import type {
    UseStoreBuilderV2Return,
    ExperimentStats,
} from "@/hooks/use-store-builder-v2";
import { cn } from "@/lib/utils";
import { STRINGS, t } from "@/lib/editor-i18n";
import { useEditorLocale } from "@/lib/editor-locale-context";

/* ─────────────────────────────────────────────────────────────────── */
/* Props                                                                */
/* ─────────────────────────────────────────────────────────────────── */

export interface ExperimentsScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
    /** Test-only — supply a fixed "now" for stable "X days ago" output. */
    nowOverride?: Date;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Constants                                                            */
/* ─────────────────────────────────────────────────────────────────── */

const STATUSES: Experiment["status"][] = [
    "running",
    "paused",
    "draft",
    "completed",
];

const STATUS_LABELS: Record<Experiment["status"], string> = {
    running: "Running",
    paused: "Paused",
    draft: "Draft",
    completed: "Completed",
};

// Merchant goal labels — replaces the engineering "Primary metric" copy
// with phrases that read as outcomes ("More orders" instead of "Orders").
const METRIC_LABELS: Record<Experiment["primary_metric"], string> = {
    orders: "More orders",
    add_to_cart: "More add-to-cart",
    click_through: "More clicks",
    revenue: "More revenue",
};

const MAX_ARMS = 6;

/* ─────────────────────────────────────────────────────────────────── */
/* Verdicts — "WINNING" / "LOSING" / "STILL LEARNING"                   */
/* ─────────────────────────────────────────────────────────────────── */

export type ExperimentVerdict = "winning" | "losing" | "learning";

export interface VerdictInput {
    significant: boolean;
    needs_more_data: boolean;
    uplift_pct: number;
    orders: number;
}

/**
 * Translate raw significance + uplift into a merchant verdict.
 * The verdict label fires on statistical significance alone (the resolver
 * uses ~95% confidence). The "Promote this version to default" CTA is
 * separately gated on `winning && orders >= 100` so we don't surface a
 * promote action on noisy low-traffic wins.
 */
export function classifyVerdict(input: VerdictInput): ExperimentVerdict {
    if (input.needs_more_data) return "learning";
    if (input.significant && input.uplift_pct > 0) return "winning";
    if (input.significant && input.uplift_pct < 0) return "losing";
    return "learning";
}

export function canPromoteWinner(input: VerdictInput): boolean {
    return classifyVerdict(input) === "winning" && input.orders >= 100;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                              */
/* ─────────────────────────────────────────────────────────────────── */

function relativeStarted(iso: string | undefined, now: Date): string {
    if (!iso) return "Not started";
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return "Not started";
    const delta = now.getTime() - then;
    if (delta < 0) return "Starts soon";
    const days = Math.floor(delta / 86_400_000);
    if (days === 0) {
        const hours = Math.floor(delta / 3_600_000);
        if (hours === 0) return "Started just now";
        return `Started ${hours}h ago`;
    }
    return `Started ${days} day${days === 1 ? "" : "s"} ago`;
}

function dateInputValue(iso: string | undefined): string {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        const pad = (n: number) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
        return "";
    }
}

function inputToIso(value: string): string {
    if (!value) return "";
    try {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return "";
        return d.toISOString();
    } catch {
        return "";
    }
}

function genArmId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `arm_${crypto.randomUUID().slice(0, 8)}`;
    }
    return `arm_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultArms(): ExperimentArm[] {
    return [
        { id: "control", label: "Control", traffic_pct: 50 },
        { id: genArmId(), label: "Variant A", traffic_pct: 50 },
    ];
}

function fmt(n: number, decimals = 0): string {
    return n.toLocaleString("en-US", {
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
    });
}

function pct(n: number): string {
    return `${(n * 100).toFixed(2)}%`;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Component                                                            */
/* ─────────────────────────────────────────────────────────────────── */

export function ExperimentsScreen({
    builder,
    onClose,
    nowOverride,
}: ExperimentsScreenProps): ReactElement {
    const experiments = builder.config.experiments;
    const [editingId, setEditingId] = useState<string | null>(null);
    const [viewingId, setViewingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [acknowledgedRefs, setAcknowledgedRefs] = useState<boolean>(false);

    const now = useMemo<Date>(() => nowOverride ?? new Date(), [nowOverride]);

    const buckets = useMemo<Record<Experiment["status"], Experiment[]>>(() => {
        const out: Record<Experiment["status"], Experiment[]> = {
            running: [],
            paused: [],
            draft: [],
            completed: [],
        };
        for (const exp of experiments) out[exp.status].push(exp);
        return out;
    }, [experiments]);

    const handleCreate = useCallback((): void => {
        const exp = builder.createExperiment({
            name: "New experiment",
            status: "draft",
            primary_metric: "orders",
            arms: defaultArms(),
        });
        setEditingId(exp.id);
    }, [builder]);

    const handlePatch = useCallback(
        (id: string, patch: Partial<Experiment>): void => {
            builder.updateExperiment(id, patch);
        },
        [builder],
    );

    const handlePause = useCallback(
        (id: string): void => {
            builder.updateExperiment(id, { status: "paused" });
        },
        [builder],
    );

    const handleResume = useCallback(
        (id: string): void => {
            builder.updateExperiment(id, { status: "running" });
        },
        [builder],
    );

    const handleStop = useCallback(
        (id: string): void => {
            builder.updateExperiment(id, {
                status: "completed",
                ends_at: new Date().toISOString(),
            });
        },
        [builder],
    );

    const handleDeleteRequest = useCallback((id: string): void => {
        setConfirmDeleteId(id);
        setAcknowledgedRefs(false);
    }, []);

    const handleDelete = useCallback((): void => {
        if (!confirmDeleteId) return;
        const refs = builder.findExperimentReferences(confirmDeleteId);
        if (refs.length > 0 && !acknowledgedRefs) {
            setAcknowledgedRefs(true);
            return;
        }
        builder.deleteExperiment(confirmDeleteId);
        if (editingId === confirmDeleteId) setEditingId(null);
        if (viewingId === confirmDeleteId) setViewingId(null);
        setConfirmDeleteId(null);
        setAcknowledgedRefs(false);
    }, [acknowledgedRefs, builder, confirmDeleteId, editingId, viewingId]);

    const editingExperiment = useMemo<Experiment | null>(
        () =>
            editingId
                ? experiments.find((e) => e.id === editingId) ?? null
                : null,
        [editingId, experiments],
    );

    const viewingExperiment = useMemo<Experiment | null>(
        () =>
            viewingId
                ? experiments.find((e) => e.id === viewingId) ?? null
                : null,
        [experiments, viewingId],
    );

    const deleteTarget = useMemo<Experiment | null>(
        () =>
            confirmDeleteId
                ? experiments.find((e) => e.id === confirmDeleteId) ?? null
                : null,
        [confirmDeleteId, experiments],
    );

    const deleteRefs = useMemo(
        () =>
            confirmDeleteId
                ? builder.findExperimentReferences(confirmDeleteId)
                : [],
        [builder, confirmDeleteId],
    );

    return (
        <div
            data-testid="experiments-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="experiments-back"
                        aria-label="Back"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <h2 className="text-base font-bold tracking-tight">
                            <ExpHeading />
                        </h2>
                        <p className="text-[11px] text-foreground/80">
                            <ExpSubtitle />
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleCreate}
                    data-testid="experiments-new"
                    className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                    <Plus className="h-3.5 w-3.5" />
                    <ExpNewLabel />
                </button>
            </header>

            {experiments.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-6">
                    <div
                        data-testid="experiments-empty"
                        className="max-w-md rounded-2xl border border-dashed border-(--card-border) p-10 text-center"
                    >
                        <BarChart3 className="mx-auto h-6 w-6 text-muted-foreground" />
                        <p className="mt-2 text-sm font-medium">No experiments yet</p>
                        <p className="mt-1 text-[12px] text-foreground/80">
                            Run A/B tests against any section variant. Pick a primary
                            metric, split traffic across arms, and promote the winner.
                        </p>
                        <button
                            type="button"
                            onClick={handleCreate}
                            data-testid="experiments-empty-new"
                            className="mt-4 inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Create your first experiment
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 overflow-hidden">
                    <div className="flex-1 space-y-5 overflow-y-auto p-5">
                        {STATUSES.map((status) =>
                            buckets[status].length === 0 ? null : (
                                <StatusBucket
                                    key={status}
                                    status={status}
                                    experiments={buckets[status]}
                                    now={now}
                                    onView={(id) => setViewingId(id)}
                                    onEdit={(id) => setEditingId(id)}
                                    onPause={handlePause}
                                    onResume={handleResume}
                                    onStop={handleStop}
                                    onDelete={handleDeleteRequest}
                                />
                            ),
                        )}
                    </div>
                </div>
            )}

            {editingExperiment && (
                <ExperimentEditor
                    experiment={editingExperiment}
                    onClose={() => setEditingId(null)}
                    onPatch={(patch) => handlePatch(editingExperiment.id, patch)}
                    onDelete={() => handleDeleteRequest(editingExperiment.id)}
                />
            )}

            {viewingExperiment && (
                <ExperimentViewer
                    experiment={viewingExperiment}
                    builder={builder}
                    onClose={() => setViewingId(null)}
                />
            )}

            {deleteTarget && (
                <DeleteConfirm
                    experiment={deleteTarget}
                    refsCount={deleteRefs.length}
                    acknowledgedRefs={acknowledgedRefs}
                    onCancel={() => {
                        setConfirmDeleteId(null);
                        setAcknowledgedRefs(false);
                    }}
                    onConfirm={handleDelete}
                />
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Status bucket                                                        */
/* ─────────────────────────────────────────────────────────────────── */

interface StatusBucketProps {
    status: Experiment["status"];
    experiments: Experiment[];
    now: Date;
    onView: (id: string) => void;
    onEdit: (id: string) => void;
    onPause: (id: string) => void;
    onResume: (id: string) => void;
    onStop: (id: string) => void;
    onDelete: (id: string) => void;
}

function StatusBucket({
    status,
    experiments,
    now,
    onView,
    onEdit,
    onPause,
    onResume,
    onStop,
    onDelete,
}: StatusBucketProps): ReactElement {
    const toneClasses =
        status === "running"
            ? "border-emerald-500/40 bg-emerald-500/5"
            : status === "paused"
              ? "border-amber-500/40 bg-amber-500/5"
              : status === "completed"
                ? "border-sky-500/40 bg-sky-500/5"
                : "border-(--card-border) bg-muted/20";
    return (
        <section
            data-testid={`experiments-bucket-${status}`}
            className={cn("overflow-hidden rounded-2xl border", toneClasses)}
        >
            <header className="flex items-center gap-2 px-4 py-2.5">
                <h3 className="text-sm font-semibold tracking-tight">
                    {STATUS_LABELS[status]}
                </h3>
                <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    {experiments.length}
                </span>
            </header>
            <div className="space-y-2 px-4 pb-4">
                {experiments.map((e) => (
                    <ExperimentRow
                        key={e.id}
                        experiment={e}
                        now={now}
                        onView={() => onView(e.id)}
                        onEdit={() => onEdit(e.id)}
                        onPause={() => onPause(e.id)}
                        onResume={() => onResume(e.id)}
                        onStop={() => onStop(e.id)}
                        onDelete={() => onDelete(e.id)}
                    />
                ))}
            </div>
        </section>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Experiment row                                                       */
/* ─────────────────────────────────────────────────────────────────── */

interface ExperimentRowProps {
    experiment: Experiment;
    now: Date;
    onView: () => void;
    onEdit: () => void;
    onPause: () => void;
    onResume: () => void;
    onStop: () => void;
    onDelete: () => void;
}

function ExperimentRow({
    experiment,
    now,
    onView,
    onEdit,
    onPause,
    onResume,
    onStop,
    onDelete,
}: ExperimentRowProps): ReactElement {
    const trafficSummary = experiment.arms
        .map((a) => `${a.label} ${a.traffic_pct}%`)
        .join(" / ");
    return (
        <article
            data-testid={`experiment-row-${experiment.id}`}
            data-status={experiment.status}
            className="rounded-xl border border-(--card-border) bg-(--card-bg) p-3"
        >
            <header className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <h4 className="truncate text-sm font-semibold tracking-tight">
                            {experiment.name || "(Untitled)"}
                        </h4>
                        <StatusBadge status={experiment.status} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {relativeStarted(experiment.starts_at, now)} ·{" "}
                        Primary metric:{" "}
                        <span className="font-medium text-foreground/80">
                            {METRIC_LABELS[experiment.primary_metric]}
                        </span>
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                        Traffic split:{" "}
                        <span className="font-medium text-foreground/80">
                            {trafficSummary}
                        </span>
                    </p>
                    <ArmsTrafficBar arms={experiment.arms} />
                </div>
            </header>
            <div className="mt-2 flex flex-wrap gap-1">
                <button
                    type="button"
                    onClick={onView}
                    data-testid={`experiment-row-${experiment.id}-view`}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-(--card-border) px-2 text-[11px] font-medium transition-colors hover:bg-muted/40"
                >
                    <Eye className="h-3 w-3" />
                    View
                </button>
                <button
                    type="button"
                    onClick={onEdit}
                    data-testid={`experiment-row-${experiment.id}-edit`}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-(--card-border) px-2 text-[11px] font-medium transition-colors hover:bg-muted/40"
                >
                    Edit
                </button>
                {experiment.status === "running" && (
                    <>
                        <button
                            type="button"
                            onClick={onPause}
                            data-testid={`experiment-row-${experiment.id}-pause`}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-(--card-border) px-2 text-[11px] font-medium transition-colors hover:bg-amber-500/10 hover:text-amber-700"
                        >
                            <Pause className="h-3 w-3" />
                            Pause
                        </button>
                        <button
                            type="button"
                            onClick={onStop}
                            data-testid={`experiment-row-${experiment.id}-stop`}
                            className="inline-flex h-7 items-center gap-1 rounded-md border border-(--card-border) px-2 text-[11px] font-medium transition-colors hover:bg-rose-500/10 hover:text-rose-700"
                        >
                            <StopCircle className="h-3 w-3" />
                            Stop &amp; promote winner
                        </button>
                    </>
                )}
                {experiment.status === "paused" && (
                    <button
                        type="button"
                        onClick={onResume}
                        data-testid={`experiment-row-${experiment.id}-resume`}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-(--card-border) px-2 text-[11px] font-medium transition-colors hover:bg-emerald-500/10 hover:text-emerald-700"
                    >
                        <Play className="h-3 w-3" />
                        Resume
                    </button>
                )}
                {(experiment.status === "draft" ||
                    experiment.status === "completed" ||
                    experiment.status === "paused") && (
                    <button
                        type="button"
                        onClick={onDelete}
                        data-testid={`experiment-row-${experiment.id}-delete`}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-(--card-border) px-2 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-500/10"
                    >
                        <Trash2 className="h-3 w-3" />
                        Delete
                    </button>
                )}
            </div>
        </article>
    );
}

function StatusBadge({
    status,
}: {
    status: Experiment["status"];
}): ReactElement {
    const tone =
        status === "running"
            ? "bg-emerald-500/20 text-emerald-700"
            : status === "paused"
              ? "bg-amber-500/20 text-amber-700"
              : status === "completed"
                ? "bg-sky-500/20 text-sky-700"
                : "bg-muted text-muted-foreground";
    return (
        <span
            className={cn(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                tone,
            )}
        >
            {STATUS_LABELS[status]}
        </span>
    );
}

function ArmsTrafficBar({ arms }: { arms: ExperimentArm[] }): ReactElement {
    const total = arms.reduce((s, a) => s + a.traffic_pct, 0);
    if (total <= 0) {
        return <div className="mt-1.5 h-1.5 rounded-full bg-muted" />;
    }
    return (
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
            {arms.map((a, i) => {
                const width = (a.traffic_pct / total) * 100;
                const tone = [
                    "bg-emerald-500",
                    "bg-sky-500",
                    "bg-amber-500",
                    "bg-rose-500",
                    "bg-violet-500",
                    "bg-cyan-500",
                ][i % 6];
                return (
                    <span
                        key={a.id}
                        style={{ width: `${width}%` }}
                        className={cn("h-full", tone)}
                        title={`${a.label} — ${a.traffic_pct}%`}
                    />
                );
            })}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Editor                                                               */
/* ─────────────────────────────────────────────────────────────────── */

interface ExperimentEditorProps {
    experiment: Experiment;
    onClose: () => void;
    onPatch: (patch: Partial<Experiment>) => void;
    onDelete: () => void;
}

function ExperimentEditor({
    experiment,
    onClose,
    onPatch,
    onDelete,
}: ExperimentEditorProps): ReactElement {
    const total = experiment.arms.reduce((s, a) => s + a.traffic_pct, 0);
    const sumsTo100 = total === 100;

    const handleAddArm = useCallback((): void => {
        if (experiment.arms.length >= MAX_ARMS) return;
        const letter = String.fromCharCode(65 + experiment.arms.length - 1); // B, C, D, …
        onPatch({
            arms: [
                ...experiment.arms,
                { id: genArmId(), label: `Variant ${letter}`, traffic_pct: 0 },
            ],
        });
    }, [experiment.arms, onPatch]);

    const handleArmChange = useCallback(
        (id: string, patch: Partial<ExperimentArm>): void => {
            onPatch({
                arms: experiment.arms.map((a) =>
                    a.id === id ? { ...a, ...patch, id: a.id } : a,
                ),
            });
        },
        [experiment.arms, onPatch],
    );

    const handleArmDelete = useCallback(
        (id: string): void => {
            if (id === "control") return;
            onPatch({
                arms: experiment.arms.filter((a) => a.id !== id),
            });
        },
        [experiment.arms, onPatch],
    );

    return (
        <div
            data-testid="experiment-editor"
            role="dialog"
            className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
        >
            <aside className="flex w-full max-w-xl flex-col border-l border-(--card-border) bg-(--card-bg) shadow-xl">
                <header className="flex items-center justify-between border-b border-(--card-border) px-5 py-3">
                    <h3 className="text-base font-bold tracking-tight">
                        Edit experiment
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="experiment-editor-close"
                        aria-label="Close"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>

                <div className="flex-1 space-y-4 overflow-y-auto p-5">
                    <Field label="Name">
                        <input
                            type="text"
                            value={experiment.name}
                            onChange={(e) => onPatch({ name: e.target.value })}
                            data-testid="experiment-editor-name"
                            className="w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                    </Field>

                    <Field label="Primary metric">
                        <select
                            value={experiment.primary_metric}
                            onChange={(e) =>
                                onPatch({
                                    primary_metric:
                                        e.target.value as Experiment["primary_metric"],
                                })
                            }
                            data-testid="experiment-editor-metric"
                            className="w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                            {(
                                ["orders", "add_to_cart", "click_through", "revenue"] as const
                            ).map((m) => (
                                <option key={m} value={m}>
                                    {METRIC_LABELS[m]}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Starts at">
                            <input
                                type="datetime-local"
                                value={dateInputValue(experiment.starts_at)}
                                onChange={(e) => {
                                    const iso = inputToIso(e.target.value);
                                    onPatch({ starts_at: iso || undefined });
                                }}
                                data-testid="experiment-editor-starts"
                                className="w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm"
                            />
                        </Field>
                        <Field label="Ends at (optional)">
                            <input
                                type="datetime-local"
                                value={dateInputValue(experiment.ends_at)}
                                onChange={(e) => {
                                    const iso = inputToIso(e.target.value);
                                    onPatch({ ends_at: iso || undefined });
                                }}
                                data-testid="experiment-editor-ends"
                                className="w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm"
                            />
                        </Field>
                    </div>

                    {/* Arms editor */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                                Arms
                            </span>
                            <button
                                type="button"
                                onClick={handleAddArm}
                                disabled={experiment.arms.length >= MAX_ARMS}
                                data-testid="experiment-editor-add-arm"
                                className={cn(
                                    "inline-flex h-7 items-center gap-1 rounded-md border border-(--card-border) px-2 text-[11px] font-medium transition-colors hover:bg-muted/40",
                                    experiment.arms.length >= MAX_ARMS && "opacity-50",
                                )}
                            >
                                <Plus className="h-3 w-3" />
                                Add arm
                            </button>
                        </div>
                        <ul className="space-y-2">
                            {experiment.arms.map((arm) => (
                                <li
                                    key={arm.id}
                                    data-testid={`experiment-arm-${arm.id}`}
                                    className="flex items-center gap-2 rounded-md border border-(--card-border) bg-background p-2"
                                >
                                    <input
                                        type="text"
                                        value={arm.label}
                                        onChange={(e) =>
                                            handleArmChange(arm.id, {
                                                label: e.target.value,
                                            })
                                        }
                                        data-testid={`experiment-arm-${arm.id}-label`}
                                        className="flex-1 rounded-md border border-(--card-border) bg-background px-2 py-1 text-sm"
                                    />
                                    <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={arm.traffic_pct}
                                        onChange={(e) =>
                                            handleArmChange(arm.id, {
                                                traffic_pct: Number(e.target.value),
                                            })
                                        }
                                        data-testid={`experiment-arm-${arm.id}-pct`}
                                        className="w-20 rounded-md border border-(--card-border) bg-background px-2 py-1 text-sm tabular-nums"
                                    />
                                    <span className="text-[12px] text-muted-foreground">%</span>
                                    <button
                                        type="button"
                                        onClick={() => handleArmDelete(arm.id)}
                                        disabled={arm.id === "control"}
                                        data-testid={`experiment-arm-${arm.id}-delete`}
                                        aria-label="Delete arm"
                                        className={cn(
                                            "inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-500/10 hover:text-rose-700",
                                            arm.id === "control" && "opacity-30 cursor-not-allowed",
                                        )}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                        <div
                            data-testid="experiment-editor-traffic-total"
                            className={cn(
                                "rounded-md border px-3 py-1.5 text-[12px]",
                                sumsTo100
                                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
                                    : "border-rose-500/40 bg-rose-500/10 text-rose-700",
                            )}
                        >
                            Total traffic:{" "}
                            <span className="font-semibold tabular-nums">{total}%</span>{" "}
                            {!sumsTo100 && (
                                <span data-testid="experiment-editor-traffic-error">
                                    — must sum to 100
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Status */}
                    <Field label="Status">
                        <div
                            role="radiogroup"
                            aria-label="Status"
                            className="flex flex-wrap gap-2"
                        >
                            {STATUSES.map((s) => (
                                <label
                                    key={s}
                                    className={cn(
                                        "inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium",
                                        experiment.status === s
                                            ? "border-primary/40 bg-primary/10 text-primary"
                                            : "border-(--card-border) text-muted-foreground",
                                    )}
                                >
                                    <input
                                        type="radio"
                                        name={`status-${experiment.id}`}
                                        checked={experiment.status === s}
                                        onChange={() => onPatch({ status: s })}
                                        data-testid={`experiment-editor-status-${s}`}
                                        className="sr-only"
                                    />
                                    {STATUS_LABELS[s]}
                                </label>
                            ))}
                        </div>
                    </Field>
                </div>

                <footer className="flex justify-between border-t border-(--card-border) bg-muted/10 px-5 py-3">
                    <button
                        type="button"
                        onClick={onDelete}
                        data-testid="experiment-editor-delete"
                        className="inline-flex h-9 items-center gap-1 rounded-md border border-rose-500/40 px-3 text-[12px] font-medium text-rose-700 transition-colors hover:bg-rose-500/10"
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="experiment-editor-done"
                        className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                    >
                        <Check className="h-3.5 w-3.5" />
                        Done
                    </button>
                </footer>
            </aside>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Viewer (live stats)                                                  */
/* ─────────────────────────────────────────────────────────────────── */

interface ExperimentViewerProps {
    experiment: Experiment;
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

function ExperimentViewer({
    experiment,
    builder,
    onClose,
}: ExperimentViewerProps): ReactElement {
    const [stats, setStats] = useState<ExperimentStats | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            const res = await builder.fetchExperimentStats(experiment.id);
            setStats(res);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load stats");
        } finally {
            setLoading(false);
        }
    }, [builder, experiment.id]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const controlId = experiment.arms[0]?.id ?? null;

    return (
        <div
            data-testid="experiment-viewer"
            role="dialog"
            className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
        >
            <aside className="flex w-full max-w-2xl flex-col border-l border-(--card-border) bg-(--card-bg) shadow-xl">
                <header className="flex items-center justify-between border-b border-(--card-border) px-5 py-3">
                    <div className="min-w-0">
                        <h3 className="truncate text-base font-bold tracking-tight">
                            {experiment.name || "(Untitled)"}
                        </h3>
                        <p className="text-[11px] text-muted-foreground">
                            Primary metric:{" "}
                            <span className="font-medium text-foreground/80">
                                {METRIC_LABELS[experiment.primary_metric]}
                            </span>
                        </p>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => void refresh()}
                            data-testid="experiment-viewer-refresh"
                            aria-label="Refresh"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        >
                            <RefreshCw
                                className={cn("h-3.5 w-3.5", loading && "animate-spin")}
                            />
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            data-testid="experiment-viewer-close"
                            aria-label="Close"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-5">
                    {error && (
                        <div className="mb-3 flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700">
                            <AlertCircle className="h-3.5 w-3.5" />
                            {error}
                        </div>
                    )}
                    {loading && !stats ? (
                        <div className="flex h-32 items-center justify-center text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                    ) : !stats ? (
                        <p className="text-[12px] text-muted-foreground">
                            No data yet.
                        </p>
                    ) : (
                        <ul className="space-y-3" data-testid="experiment-viewer-arms">
                            {experiment.arms.map((arm) => {
                                const armStats = stats.per_arm[arm.id] ?? {
                                    visitors: 0,
                                    add_to_cart: 0,
                                    checkout_start: 0,
                                    orders: 0,
                                    revenue_iqd: 0,
                                    conversion_rate: 0,
                                    avg_order_value: 0,
                                };
                                const sig = stats.significance[arm.id];
                                const isControl = arm.id === controlId;
                                return (
                                    <li
                                        key={arm.id}
                                        data-testid={`experiment-viewer-arm-${arm.id}`}
                                        className="rounded-xl border border-(--card-border) bg-background p-3"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-semibold">
                                                    {arm.label}
                                                </h4>
                                                {isControl && (
                                                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                                        Control
                                                    </span>
                                                )}
                                                <span className="text-[11px] text-muted-foreground">
                                                    {arm.traffic_pct}% traffic
                                                </span>
                                            </div>
                                            {sig && !isControl && (
                                                <SignificanceBadge
                                                    sig={sig}
                                                    orders={armStats.orders}
                                                />
                                            )}
                                        </div>
                                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-4">
                                            <Stat
                                                label="Visitors"
                                                value={fmt(armStats.visitors)}
                                                testId={`experiment-viewer-arm-${arm.id}-visitors`}
                                            />
                                            <Stat
                                                label="ATC"
                                                value={
                                                    armStats.visitors > 0
                                                        ? pct(
                                                              armStats.add_to_cart /
                                                                  armStats.visitors,
                                                          )
                                                        : "—"
                                                }
                                            />
                                            <Stat
                                                label="Checkout"
                                                value={
                                                    armStats.visitors > 0
                                                        ? pct(
                                                              armStats.checkout_start /
                                                                  armStats.visitors,
                                                          )
                                                        : "—"
                                                }
                                            />
                                            <Stat
                                                label="Conversion"
                                                value={
                                                    armStats.visitors > 0
                                                        ? pct(armStats.conversion_rate)
                                                        : "—"
                                                }
                                                testId={`experiment-viewer-arm-${arm.id}-cr`}
                                            />
                                            <Stat
                                                label="Orders"
                                                value={fmt(armStats.orders)}
                                            />
                                            <Stat
                                                label="Revenue (IQD)"
                                                value={fmt(armStats.revenue_iqd)}
                                            />
                                            <Stat
                                                label="AOV"
                                                value={
                                                    armStats.orders > 0
                                                        ? fmt(armStats.avg_order_value, 0)
                                                        : "—"
                                                }
                                            />
                                            {sig && !isControl && (
                                                <Stat
                                                    label="Uplift vs control"
                                                    value={`${sig.uplift_pct >= 0 ? "+" : ""}${sig.uplift_pct.toFixed(2)}%`}
                                                    testId={`experiment-viewer-arm-${arm.id}-uplift`}
                                                />
                                            )}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </aside>
        </div>
    );
}

function Stat({
    label,
    value,
    testId,
}: {
    label: string;
    value: string;
    testId?: string;
}): ReactElement {
    return (
        <div data-testid={testId}>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {label}
            </div>
            <div className="text-sm font-semibold tabular-nums">{value}</div>
        </div>
    );
}

function SignificanceBadge({
    sig,
    orders = 0,
}: {
    sig: {
        z: number | null;
        significant: boolean;
        needs_more_data: boolean;
        uplift_pct: number;
    };
    orders?: number;
}): ReactElement {
    const locale = useEditorLocale();
    const verdict = classifyVerdict({
        significant: sig.significant,
        needs_more_data: sig.needs_more_data,
        uplift_pct: sig.uplift_pct,
        orders,
    });
    if (verdict === "winning") {
        return (
            <span
                data-testid="experiment-verdict-winning"
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700"
                title={t(STRINGS.experiment.verdict_winning_hint, locale)}
            >
                <Trophy className="h-3 w-3" />
                {t(STRINGS.experiment.verdict_winning, locale)}
            </span>
        );
    }
    if (verdict === "losing") {
        return (
            <span
                data-testid="experiment-verdict-losing"
                className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700"
                title={t(STRINGS.experiment.verdict_losing_hint, locale)}
            >
                {t(STRINGS.experiment.verdict_losing, locale)}
            </span>
        );
    }
    return (
        <span
            data-testid="experiment-verdict-learning"
            className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            title={t(STRINGS.experiment.verdict_learning_hint, locale)}
        >
            {t(STRINGS.experiment.verdict_learning, locale)}
        </span>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* i18n helper components                                               */
/* ─────────────────────────────────────────────────────────────────── */

function ExpHeading(): ReactElement {
    const locale = useEditorLocale();
    return <>{t(STRINGS.experiment.heading, locale)}</>;
}

function ExpSubtitle(): ReactElement {
    const locale = useEditorLocale();
    return <>{t(STRINGS.experiment.subtitle, locale)}</>;
}

function ExpNewLabel(): ReactElement {
    const locale = useEditorLocale();
    return <>{t(STRINGS.experiment.new, locale)}</>;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Delete confirm                                                       */
/* ─────────────────────────────────────────────────────────────────── */

interface DeleteConfirmProps {
    experiment: Experiment;
    refsCount: number;
    acknowledgedRefs: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

function DeleteConfirm({
    experiment,
    refsCount,
    acknowledgedRefs,
    onCancel,
    onConfirm,
}: DeleteConfirmProps): ReactElement {
    const needsAck = refsCount > 0 && !acknowledgedRefs;
    return (
        <div
            data-testid="experiment-delete-confirm"
            role="dialog"
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
        >
            <div className="w-full max-w-md overflow-hidden rounded-2xl border border-(--card-border) bg-(--card-bg) shadow-xl">
                <header className="flex items-center justify-between border-b border-(--card-border) px-5 py-3">
                    <h3 className="text-base font-semibold tracking-tight">
                        Delete &ldquo;{experiment.name || "Untitled"}&rdquo;?
                    </h3>
                    <button
                        type="button"
                        onClick={onCancel}
                        data-testid="experiment-delete-cancel"
                        aria-label="Cancel"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>
                <div className="space-y-3 p-5 text-[12px]">
                    {refsCount > 0 ? (
                        <div
                            data-testid="experiment-delete-refs-warning"
                            className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300"
                        >
                            <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
                            <p>
                                This experiment is referenced by{" "}
                                <span
                                    data-testid="experiment-delete-refs-count"
                                    className="font-semibold"
                                >
                                    {refsCount}
                                </span>{" "}
                                variant{refsCount === 1 ? "" : "s"}. Deleting it will
                                leave those variants targeting a non-existent test.
                                Proceed?
                            </p>
                        </div>
                    ) : (
                        <p className="text-muted-foreground">
                            This will remove the experiment from your store config.
                        </p>
                    )}
                </div>
                <footer className="flex justify-end gap-2 border-t border-(--card-border) bg-muted/10 px-5 py-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        data-testid="experiment-delete-cancel-btn"
                        className="inline-flex h-9 items-center rounded-md px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        data-testid="experiment-delete-confirm-btn"
                        className="inline-flex h-9 items-center gap-1 rounded-md bg-rose-600 px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
                    >
                        {needsAck ? (
                            <>
                                <AlertCircle className="h-3.5 w-3.5" />
                                I understand, continue
                            </>
                        ) : (
                            <>
                                <Check className="h-3.5 w-3.5" />
                                Delete experiment
                            </>
                        )}
                    </button>
                </footer>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Field helper                                                         */
/* ─────────────────────────────────────────────────────────────────── */

function Field({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}): ReactElement {
    return (
        <label className="block space-y-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                {label}
            </span>
            {children}
        </label>
    );
}
