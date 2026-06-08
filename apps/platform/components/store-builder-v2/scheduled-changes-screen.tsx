"use client";

// =====================================================================
// ScheduledChangesScreen — settings screen for `store_config_schedules`
// =====================================================================
// Renders three grouped time-bands (Active, Upcoming, Expired+Cancelled)
// and a "+ New schedule" modal with cascading Page → Section → Variant
// selects. Variant creation in-line writes a `time_window` variant into
// the chosen section, then inserts the schedule row pointing at it.
// =====================================================================

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactElement,
} from "react";
import {
    AlertCircle,
    Calendar,
    Check,
    ChevronLeft,
    Clock,
    Loader2,
    Plus,
    RefreshCw,
    Play,
    Trash2,
    X,
    StopCircle,
    Pencil,
    Eye,
} from "lucide-react";
import type {
    PageId,
    ScheduledChange,
    SectionInstance,
    Variant,
} from "@scheniders/shared";
import type {
    UseStoreBuilderV2Return,
    StoredSchedule,
    ScheduleStatus,
} from "@/hooks/use-store-builder-v2";
import { cn } from "@/lib/utils";
import { getPageLabel } from "./page-tree";

/* ─────────────────────────────────────────────────────────────────── */
/* Props                                                                */
/* ─────────────────────────────────────────────────────────────────── */

export interface ScheduledChangesScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
    /** Test-only — preloaded schedules list. */
    initialSchedules?: StoredSchedule[];
    /** Test-only — supply a fixed "now" so derived statuses are stable. */
    nowOverride?: Date;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                              */
/* ─────────────────────────────────────────────────────────────────── */

function describeRelative(target: Date, now: Date, suffix: "ago" | "in"): string {
    const delta = Math.abs(target.getTime() - now.getTime());
    const mins = Math.floor(delta / 60_000);
    if (mins < 60) {
        const v = `${mins}m`;
        return suffix === "ago" ? `${v} ago` : `in ${v}`;
    }
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) {
        const v = `${hrs}h`;
        return suffix === "ago" ? `${v} ago` : `in ${v}`;
    }
    const days = Math.floor(hrs / 24);
    const v = `${days} day${days === 1 ? "" : "s"}`;
    return suffix === "ago" ? `${v} ago` : `in ${v}`;
}

function deriveStatus(s: StoredSchedule, now: Date): ScheduleStatus {
    if (s.status === "cancelled") return "cancelled";
    const start = new Date(s.starts_at_iso);
    const end = s.ends_at_iso ? new Date(s.ends_at_iso) : null;
    if (start > now) return "scheduled";
    if (!end || end > now) return "active";
    return "expired";
}

function dateInputValue(iso: string | undefined): string {
    if (!iso) return "";
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "";
        // datetime-local expects YYYY-MM-DDTHH:mm in local time.
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

/* ─────────────────────────────────────────────────────────────────── */
/* Target lookup                                                        */
/* ─────────────────────────────────────────────────────────────────── */

interface ResolvedTarget {
    page_id: PageId;
    section_id: string;
    variant_id: string;
    section_label?: string;
    section_type?: string;
    variant_label?: string;
}

function resolveTargets(
    builder: UseStoreBuilderV2Return,
    targets: ScheduledChange["targets"],
): ResolvedTarget[] {
    return targets.map((t) => {
        const page = builder.config.pages.find((p) => p.page_id === t.page_id);
        const section = page?.sections.find((s) => s.id === t.section_id);
        const variant = section?.variants?.find((v) => v.id === t.variant_id);
        return {
            page_id: t.page_id,
            section_id: t.section_id,
            variant_id: t.variant_id,
            section_label: section?.label ?? undefined,
            section_type: section?.type ?? undefined,
            variant_label: variant?.label ?? undefined,
        };
    });
}

/* ─────────────────────────────────────────────────────────────────── */
/* Component                                                            */
/* ─────────────────────────────────────────────────────────────────── */

export function ScheduledChangesScreen({
    builder,
    onClose,
    initialSchedules,
    nowOverride,
}: ScheduledChangesScreenProps): ReactElement {
    const [schedules, setSchedules] = useState<StoredSchedule[] | null>(initialSchedules ?? null);
    const [loading, setLoading] = useState<boolean>(!initialSchedules);
    const [error, setError] = useState<string | null>(null);
    const [creatorOpen, setCreatorOpen] = useState<boolean>(false);
    const [showExpired, setShowExpired] = useState<boolean>(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
    const [viewTargetsOf, setViewTargetsOf] = useState<StoredSchedule | null>(null);

    const mountedRef = useRef<boolean>(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const now = useMemo<Date>(() => nowOverride ?? new Date(), [nowOverride]);

    /* ── Load ──────────────────────────────────────────────────── */

    const refresh = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            const rows = await builder.listSchedules();
            if (!mountedRef.current) return;
            setSchedules(rows);
        } catch (err) {
            if (!mountedRef.current) return;
            setError(err instanceof Error ? err.message : "Failed to load schedules");
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [builder]);

    useEffect(() => {
        if (initialSchedules !== undefined) return;
        void refresh();
    }, [initialSchedules, refresh]);

    /* ── Buckets ─────────────────────────────────────────────── */

    const buckets = useMemo(() => {
        const out: Record<ScheduleStatus, StoredSchedule[]> = {
            active: [],
            scheduled: [],
            expired: [],
            cancelled: [],
        };
        for (const s of schedules ?? []) {
            const status = deriveStatus(s, now);
            out[status].push(s);
        }
        return out;
    }, [now, schedules]);

    /* ── Actions ─────────────────────────────────────────────── */

    const handleEndEarly = useCallback(
        async (s: StoredSchedule): Promise<void> => {
            setBusyId(s.id);
            try {
                const nowIso = new Date().toISOString();
                await builder.updateSchedule(s.id, {
                    ends_at_iso: nowIso,
                    status: "expired",
                });
                setSchedules((prev) =>
                    prev
                        ? prev.map((r) =>
                              r.id === s.id
                                  ? { ...r, ends_at_iso: nowIso, status: "expired" }
                                  : r,
                          )
                        : prev,
                );
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to end schedule");
            } finally {
                if (mountedRef.current) setBusyId(null);
            }
        },
        [builder],
    );

    const handleCancel = useCallback(
        async (s: StoredSchedule): Promise<void> => {
            setBusyId(s.id);
            try {
                await builder.cancelSchedule(s.id);
                setSchedules((prev) =>
                    prev
                        ? prev.map((r) =>
                              r.id === s.id ? { ...r, status: "cancelled" } : r,
                          )
                        : prev,
                );
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to cancel schedule");
            } finally {
                if (mountedRef.current) setBusyId(null);
            }
        },
        [builder],
    );

    const handleDelete = useCallback(
        async (s: StoredSchedule): Promise<void> => {
            setBusyId(s.id);
            try {
                await builder.deleteSchedule(s.id);
                setSchedules((prev) => (prev ? prev.filter((r) => r.id !== s.id) : prev));
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to delete schedule");
            } finally {
                if (mountedRef.current) setBusyId(null);
            }
        },
        [builder],
    );

    const handleCreated = useCallback((row: StoredSchedule): void => {
        setSchedules((prev) => (prev ? [row, ...prev] : [row]));
        setCreatorOpen(false);
    }, []);

    const handleUpdatedStart = useCallback(
        async (s: StoredSchedule, nextStartIso: string): Promise<void> => {
            setBusyId(s.id);
            try {
                await builder.updateSchedule(s.id, { starts_at_iso: nextStartIso });
                setSchedules((prev) =>
                    prev
                        ? prev.map((r) =>
                              r.id === s.id ? { ...r, starts_at_iso: nextStartIso } : r,
                          )
                        : prev,
                );
                setEditingScheduleId(null);
            } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to update");
            } finally {
                if (mountedRef.current) setBusyId(null);
            }
        },
        [builder],
    );

    /* ── Render ──────────────────────────────────────────────── */

    return (
        <div
            data-testid="scheduled-changes-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            {/* Header */}
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="scheduled-changes-back"
                        aria-label="Back"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <h2 className="text-base font-bold tracking-tight">Scheduled Changes</h2>
                        <p className="text-[11px] text-foreground/80">
                            Time-windowed variants you&apos;ve set up across your store.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        data-testid="scheduled-changes-refresh"
                        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                        Refresh
                    </button>
                    <button
                        type="button"
                        onClick={() => setCreatorOpen(true)}
                        data-testid="scheduled-changes-new"
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        New schedule
                    </button>
                </div>
            </header>

            {error && (
                <div className="flex shrink-0 items-center gap-2 border-b border-rose-500/20 bg-rose-500/10 px-5 py-2 text-[12px] text-rose-700 dark:text-rose-300">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {error}
                </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
                {loading && !schedules ? (
                    <div className="flex h-32 items-center justify-center text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                ) : (schedules ?? []).length === 0 ? (
                    <div
                        data-testid="scheduled-changes-empty"
                        className="rounded-2xl border border-dashed border-(--card-border) p-10 text-center"
                    >
                        <Calendar className="mx-auto h-6 w-6 text-muted-foreground" />
                        <p className="mt-2 text-sm font-medium">No scheduled changes</p>
                        <p className="mt-1 text-[12px] text-foreground/80">
                            Use this screen to schedule future variants of any section —
                            promo banners, hero swaps, free-shipping notices, and more.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-5">
                        <Bucket
                            title="Active"
                            tone="active"
                            count={buckets.active.length}
                            testId="bucket-active"
                        >
                            {buckets.active.map((s) => (
                                <ScheduleRow
                                    key={s.id}
                                    schedule={s}
                                    status="active"
                                    now={now}
                                    builder={builder}
                                    busy={busyId === s.id}
                                    onView={() => setViewTargetsOf(s)}
                                    onEndEarly={() => void handleEndEarly(s)}
                                    onDelete={() => void handleCancel(s)}
                                />
                            ))}
                        </Bucket>

                        <Bucket
                            title="Upcoming"
                            tone="upcoming"
                            count={buckets.scheduled.length}
                            testId="bucket-upcoming"
                        >
                            {buckets.scheduled.map((s) => (
                                <ScheduleRow
                                    key={s.id}
                                    schedule={s}
                                    status="scheduled"
                                    now={now}
                                    builder={builder}
                                    busy={busyId === s.id}
                                    isEditing={editingScheduleId === s.id}
                                    onView={() => setViewTargetsOf(s)}
                                    onEditStart={() => setEditingScheduleId(s.id)}
                                    onEditStartCancel={() => setEditingScheduleId(null)}
                                    onEditStartSave={(iso) => void handleUpdatedStart(s, iso)}
                                    onCancel={() => void handleCancel(s)}
                                />
                            ))}
                        </Bucket>

                        {(buckets.expired.length > 0 || buckets.cancelled.length > 0) && (
                            <Bucket
                                title="Expired"
                                tone="expired"
                                count={buckets.expired.length + buckets.cancelled.length}
                                testId="bucket-expired"
                                collapsible
                                expanded={showExpired}
                                onToggle={() => setShowExpired((v) => !v)}
                            >
                                {showExpired && (
                                    <>
                                        {[...buckets.expired, ...buckets.cancelled].map((s) => (
                                            <ScheduleRow
                                                key={s.id}
                                                schedule={s}
                                                status={deriveStatus(s, now)}
                                                now={now}
                                                builder={builder}
                                                busy={busyId === s.id}
                                                onView={() => setViewTargetsOf(s)}
                                                onDelete={() => void handleDelete(s)}
                                            />
                                        ))}
                                    </>
                                )}
                            </Bucket>
                        )}
                    </div>
                )}
            </div>

            {/* Creator */}
            {creatorOpen && (
                <ScheduleCreatorModal
                    builder={builder}
                    onClose={() => setCreatorOpen(false)}
                    onCreated={handleCreated}
                />
            )}

            {/* Targets viewer */}
            {viewTargetsOf && (
                <TargetsViewer
                    schedule={viewTargetsOf}
                    builder={builder}
                    onClose={() => setViewTargetsOf(null)}
                />
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Bucket                                                                */
/* ─────────────────────────────────────────────────────────────────── */

interface BucketProps {
    title: string;
    tone: "active" | "upcoming" | "expired";
    count: number;
    testId: string;
    collapsible?: boolean;
    expanded?: boolean;
    onToggle?: () => void;
    children: React.ReactNode;
}

function Bucket({
    title,
    tone,
    count,
    testId,
    collapsible,
    expanded,
    onToggle,
    children,
}: BucketProps): ReactElement {
    const toneClasses =
        tone === "active"
            ? "border-emerald-500/40 bg-emerald-500/5"
            : tone === "upcoming"
              ? "border-sky-500/40 bg-sky-500/5"
              : "border-(--card-border) bg-muted/20";
    return (
        <section
            data-testid={testId}
            className={cn(
                "overflow-hidden rounded-2xl border",
                toneClasses,
            )}
        >
            <header className="flex items-center justify-between px-4 py-2.5">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
                    <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
                        {count}
                    </span>
                </div>
                {collapsible && (
                    <button
                        type="button"
                        onClick={onToggle}
                        data-testid={`${testId}-toggle`}
                        className="text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                    >
                        {expanded ? "hide" : "show"}
                    </button>
                )}
            </header>
            <div className="space-y-2 px-4 pb-4">{children}</div>
        </section>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* ScheduleRow                                                           */
/* ─────────────────────────────────────────────────────────────────── */

interface ScheduleRowProps {
    schedule: StoredSchedule;
    status: ScheduleStatus;
    now: Date;
    builder: UseStoreBuilderV2Return;
    busy: boolean;
    isEditing?: boolean;
    onView: () => void;
    onEndEarly?: () => void;
    onDelete?: () => void;
    onCancel?: () => void;
    onEditStart?: () => void;
    onEditStartCancel?: () => void;
    onEditStartSave?: (iso: string) => void;
}

function ScheduleRow({
    schedule,
    status,
    now,
    builder,
    busy,
    isEditing,
    onView,
    onEndEarly,
    onDelete,
    onCancel,
    onEditStart,
    onEditStartCancel,
    onEditStartSave,
}: ScheduleRowProps): ReactElement {
    const start = new Date(schedule.starts_at_iso);
    const end = schedule.ends_at_iso ? new Date(schedule.ends_at_iso) : null;

    const startedAgo = describeRelative(start, now, "ago");
    const endsIn = end ? describeRelative(end, now, "in") : null;
    const startsIn = describeRelative(start, now, "in");
    const endsAgo = end ? describeRelative(end, now, "ago") : null;

    const resolved = useMemo(
        () => resolveTargets(builder, schedule.targets),
        [builder, schedule.targets],
    );

    const targetSummary =
        resolved.length === 0
            ? "—"
            : resolved
                  .map((t) => {
                      const sec = t.section_label || t.section_type || "Section";
                      const variant = t.variant_label ? ` / "${t.variant_label}"` : "";
                      return `${getPageLabel(t.page_id)} / ${sec}${variant}`;
                  })
                  .join("; ");

    const [editStartValue, setEditStartValue] = useState<string>(dateInputValue(schedule.starts_at_iso));
    useEffect(() => {
        setEditStartValue(dateInputValue(schedule.starts_at_iso));
    }, [schedule.starts_at_iso]);

    const icon =
        status === "active" ? (
            <Play className="h-3.5 w-3.5" />
        ) : status === "scheduled" ? (
            <Clock className="h-3.5 w-3.5" />
        ) : status === "cancelled" ? (
            <X className="h-3.5 w-3.5" />
        ) : (
            <Calendar className="h-3.5 w-3.5" />
        );

    return (
        <article
            data-testid={`schedule-row-${schedule.id}`}
            data-status={status}
            className="rounded-xl border border-(--card-border) bg-(--card-bg) p-3"
        >
            <header className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span
                        className={cn(
                            "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                            status === "active" && "bg-emerald-500/20 text-emerald-600",
                            status === "scheduled" && "bg-sky-500/20 text-sky-600",
                            status === "expired" && "bg-muted text-muted-foreground",
                            status === "cancelled" && "bg-rose-500/20 text-rose-600",
                        )}
                    >
                        {icon}
                    </span>
                    <h4 className="truncate text-sm font-semibold tracking-tight">
                        {schedule.label}
                    </h4>
                </div>
                {busy && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </header>

            <div className="mt-1.5 ml-8 text-[11px] text-muted-foreground">
                {status === "active" && (
                    <>
                        Started {startedAgo}
                        {endsIn ? ` — ends ${endsIn}` : " — no end date"}
                    </>
                )}
                {status === "scheduled" && (
                    <>
                        Starts {startsIn}
                        {endsIn ? ` — ends ${endsIn}` : ""}
                    </>
                )}
                {status === "expired" && <>Ended {endsAgo ?? startedAgo}</>}
                {status === "cancelled" && <>Cancelled</>}
            </div>

            <div className="mt-1 ml-8 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground/80">Target:</span> {targetSummary}
            </div>

            {isEditing && status === "scheduled" && (
                <div
                    data-testid={`schedule-row-${schedule.id}-edit-start`}
                    className="mt-2 ml-8 flex items-center gap-2 rounded-md border border-(--card-border) bg-muted/20 p-2"
                >
                    <input
                        type="datetime-local"
                        value={editStartValue}
                        onChange={(e) => setEditStartValue(e.target.value)}
                        data-testid={`schedule-row-${schedule.id}-edit-start-input`}
                        className="rounded-md border border-(--card-border) bg-background px-2 py-1 text-[12px]"
                    />
                    <button
                        type="button"
                        onClick={() => {
                            const iso = inputToIso(editStartValue);
                            if (iso) onEditStartSave?.(iso);
                        }}
                        data-testid={`schedule-row-${schedule.id}-edit-start-save`}
                        className="inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2 text-[11px] font-semibold text-primary-foreground"
                    >
                        <Check className="h-3 w-3" />
                        Save
                    </button>
                    <button
                        type="button"
                        onClick={onEditStartCancel}
                        data-testid={`schedule-row-${schedule.id}-edit-start-cancel`}
                        className="inline-flex h-7 items-center rounded-md px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                        Cancel
                    </button>
                </div>
            )}

            <div className="mt-2 ml-8 flex flex-wrap gap-1">
                <button
                    type="button"
                    onClick={onView}
                    data-testid={`schedule-row-${schedule.id}-view`}
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-(--card-border) px-2 text-[11px] font-medium transition-colors hover:bg-black/5"
                >
                    <Eye className="h-3 w-3" />
                    View
                </button>
                {status === "active" && onEndEarly && (
                    <button
                        type="button"
                        onClick={onEndEarly}
                        disabled={busy}
                        data-testid={`schedule-row-${schedule.id}-end-early`}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-(--card-border) px-2 text-[11px] font-medium transition-colors hover:bg-amber-500/10 hover:text-amber-700"
                    >
                        <StopCircle className="h-3 w-3" />
                        End early
                    </button>
                )}
                {status === "scheduled" && onEditStart && !isEditing && (
                    <button
                        type="button"
                        onClick={onEditStart}
                        disabled={busy}
                        data-testid={`schedule-row-${schedule.id}-edit`}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-(--card-border) px-2 text-[11px] font-medium transition-colors hover:bg-black/5"
                    >
                        <Pencil className="h-3 w-3" />
                        Edit start
                    </button>
                )}
                {(status === "active" || status === "scheduled") && onCancel && (
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        data-testid={`schedule-row-${schedule.id}-cancel`}
                        className="inline-flex h-7 items-center gap-1 rounded-md border border-(--card-border) px-2 text-[11px] font-medium text-rose-700 transition-colors hover:bg-rose-500/10"
                    >
                        <Trash2 className="h-3 w-3" />
                        Cancel
                    </button>
                )}
                {(status === "expired" || status === "cancelled" || status === "active") && onDelete && (
                    <button
                        type="button"
                        onClick={onDelete}
                        disabled={busy}
                        data-testid={`schedule-row-${schedule.id}-delete`}
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

/* ─────────────────────────────────────────────────────────────────── */
/* TargetsViewer                                                         */
/* ─────────────────────────────────────────────────────────────────── */

interface TargetsViewerProps {
    schedule: StoredSchedule;
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
}

function TargetsViewer({ schedule, builder, onClose }: TargetsViewerProps): ReactElement {
    const resolved = useMemo(
        () => resolveTargets(builder, schedule.targets),
        [builder, schedule.targets],
    );

    return (
        <div
            data-testid="schedule-targets-viewer"
            className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
        >
            <aside className="flex w-full max-w-md flex-col border-l border-(--card-border) bg-(--card-bg) shadow-xl">
                <header className="flex items-center justify-between border-b border-(--card-border) px-4 py-3">
                    <h3 className="text-sm font-semibold tracking-tight">{schedule.label}</h3>
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="schedule-targets-viewer-close"
                        aria-label="Close"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>
                <div className="flex-1 overflow-y-auto p-4">
                    <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                        Targets
                    </h4>
                    {resolved.length === 0 ? (
                        <p className="text-[12px] text-foreground/80">No targets.</p>
                    ) : (
                        <ul className="space-y-2">
                            {resolved.map((t, i) => {
                                const section = builder.config.pages
                                    .find((p) => p.page_id === t.page_id)
                                    ?.sections.find((s) => s.id === t.section_id);
                                const variant = section?.variants?.find((v) => v.id === t.variant_id);
                                return (
                                    <li
                                        key={`${t.section_id}-${t.variant_id}-${i}`}
                                        className="rounded-md border border-(--card-border) bg-background p-3 text-[12px]"
                                    >
                                        <div className="font-medium">{getPageLabel(t.page_id)}</div>
                                        <div className="text-muted-foreground">
                                            Section:{" "}
                                            <span className="text-foreground/80">
                                                {t.section_label || t.section_type || "Unknown"}
                                            </span>
                                        </div>
                                        <div className="text-muted-foreground">
                                            Variant:{" "}
                                            <span className="text-foreground/80">
                                                {t.variant_label || "(missing)"}
                                            </span>
                                        </div>
                                        {variant?.override && (
                                            <details className="mt-2">
                                                <summary className="cursor-pointer text-[11px] text-muted-foreground hover:text-foreground">
                                                    Variant override
                                                </summary>
                                                <pre className="mt-1 max-h-40 overflow-auto rounded-md bg-muted/40 p-2 text-[10px]">
                                                    {JSON.stringify(variant.override, null, 2)}
                                                </pre>
                                            </details>
                                        )}
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

/* ─────────────────────────────────────────────────────────────────── */
/* ScheduleCreatorModal                                                  */
/* ─────────────────────────────────────────────────────────────────── */

interface ScheduleCreatorModalProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
    onCreated: (row: StoredSchedule) => void;
}

const NEW_VARIANT_SENTINEL = "__create_new__";

function ScheduleCreatorModal({
    builder,
    onClose,
    onCreated,
}: ScheduleCreatorModalProps): ReactElement {
    const [label, setLabel] = useState<string>("");
    const [startInput, setStartInput] = useState<string>("");
    const [endInput, setEndInput] = useState<string>("");
    const [timezone, setTimezone] = useState<string>("Asia/Baghdad");
    const [pageId, setPageId] = useState<PageId | "">("");
    const [sectionId, setSectionId] = useState<string>("");
    const [variantId, setVariantId] = useState<string>("");
    const [newVariantLabel, setNewVariantLabel] = useState<string>("");
    const [submitting, setSubmitting] = useState<boolean>(false);
    const [formError, setFormError] = useState<string | null>(null);

    const availablePages = builder.config.pages;
    const availableSections = useMemo<SectionInstance[]>(() => {
        if (!pageId) return [];
        const p = builder.config.pages.find((x) => x.page_id === pageId);
        return p?.sections ?? [];
    }, [builder.config.pages, pageId]);

    const availableVariants = useMemo<Variant[]>(() => {
        if (!sectionId) return [];
        const sec = availableSections.find((s) => s.id === sectionId);
        return sec?.variants ?? [];
    }, [availableSections, sectionId]);

    // Reset deeper selects when parent changes.
    useEffect(() => {
        setSectionId("");
        setVariantId("");
    }, [pageId]);
    useEffect(() => {
        setVariantId("");
    }, [sectionId]);

    const handleSubmit = useCallback(async (): Promise<void> => {
        setFormError(null);
        if (!label.trim()) {
            setFormError("Label is required");
            return;
        }
        const startsIso = inputToIso(startInput);
        if (!startsIso) {
            setFormError("Valid start date is required");
            return;
        }
        const endsIso = endInput ? inputToIso(endInput) : undefined;
        if (endInput && !endsIso) {
            setFormError("End date is invalid");
            return;
        }
        if (endsIso && new Date(endsIso) <= new Date(startsIso)) {
            setFormError("End must be after start");
            return;
        }
        if (!pageId) {
            setFormError("Pick a page");
            return;
        }
        if (!sectionId) {
            setFormError("Pick a section");
            return;
        }
        if (!variantId) {
            setFormError("Pick or create a variant");
            return;
        }

        setSubmitting(true);
        try {
            let resolvedVariantId = variantId;

            if (variantId === NEW_VARIANT_SENTINEL) {
                const trimmedVariantLabel = newVariantLabel.trim() || `Scheduled — ${label.trim()}`;
                const newVariantId = genId();
                const newVariant: Variant = {
                    id: newVariantId,
                    label: trimmedVariantLabel,
                    conditions: [
                        {
                            kind: "time_window",
                            start_iso: startsIso,
                            end_iso: endsIso,
                            timezone,
                        },
                    ],
                    override: {},
                    priority: 100,
                    enabled: true,
                };
                builder.setConfig((prev) => {
                    const pages = prev.pages.map((p) => {
                        if (p.page_id !== pageId) return p;
                        return {
                            ...p,
                            sections: p.sections.map((s) => {
                                if (s.id !== sectionId) return s;
                                return {
                                    ...s,
                                    variants: [...(s.variants ?? []), newVariant],
                                };
                            }),
                        };
                    });
                    return { ...prev, pages };
                });
                resolvedVariantId = newVariantId;
            }

            const row = await builder.createSchedule({
                label: label.trim(),
                starts_at_iso: startsIso,
                ends_at_iso: endsIso,
                timezone,
                targets: [
                    {
                        page_id: pageId,
                        section_id: sectionId,
                        variant_id: resolvedVariantId,
                    },
                ],
            });
            onCreated(row);
        } catch (err) {
            setFormError(err instanceof Error ? err.message : "Failed to create schedule");
        } finally {
            setSubmitting(false);
        }
    }, [
        builder,
        endInput,
        label,
        newVariantLabel,
        onCreated,
        pageId,
        sectionId,
        startInput,
        timezone,
        variantId,
    ]);

    return (
        <div
            data-testid="schedule-creator-modal"
            role="dialog"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        >
            <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-(--card-border) bg-(--card-bg) shadow-xl">
                <header className="flex items-center justify-between border-b border-(--card-border) px-5 py-3">
                    <div>
                        <h3 className="text-base font-semibold tracking-tight">New schedule</h3>
                        <p className="text-[11px] text-foreground/80">
                            Show a section variant for a fixed time window.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="schedule-creator-close"
                        aria-label="Close"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-black/5 hover:text-foreground"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </header>

                <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
                    {/* Label */}
                    <Field label="Label">
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            placeholder="e.g. 'Black Friday hero swap'"
                            data-testid="schedule-creator-label"
                            className="w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                    </Field>

                    {/* Date/time */}
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="Start date / time">
                            <input
                                type="datetime-local"
                                value={startInput}
                                onChange={(e) => setStartInput(e.target.value)}
                                data-testid="schedule-creator-start"
                                className="w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                        </Field>
                        <Field label="End date / time (optional)">
                            <input
                                type="datetime-local"
                                value={endInput}
                                onChange={(e) => setEndInput(e.target.value)}
                                data-testid="schedule-creator-end"
                                className="w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                        </Field>
                    </div>

                    {/* Timezone */}
                    <Field label="Timezone">
                        <select
                            value={timezone}
                            onChange={(e) => setTimezone(e.target.value)}
                            data-testid="schedule-creator-timezone"
                            className="w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                            <option value="Asia/Baghdad">Asia/Baghdad</option>
                            <option value="UTC">UTC</option>
                            <option value="Asia/Dubai">Asia/Dubai</option>
                            <option value="Europe/Istanbul">Europe/Istanbul</option>
                        </select>
                    </Field>

                    {/* Target cascade */}
                    <Field label="Page">
                        <select
                            value={pageId}
                            onChange={(e) => setPageId(e.target.value as PageId)}
                            data-testid="schedule-creator-page"
                            className="w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        >
                            <option value="">Choose a page…</option>
                            {availablePages.map((p) => (
                                <option key={p.page_id} value={p.page_id}>
                                    {getPageLabel(p.page_id)}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Section">
                        <select
                            value={sectionId}
                            onChange={(e) => setSectionId(e.target.value)}
                            disabled={!pageId}
                            data-testid="schedule-creator-section"
                            className={cn(
                                "w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30",
                                !pageId && "opacity-50",
                            )}
                        >
                            <option value="">
                                {pageId ? "Choose a section…" : "Pick a page first"}
                            </option>
                            {availableSections.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.type}
                                    {s.label ? ` — ${s.label}` : ""}
                                </option>
                            ))}
                        </select>
                    </Field>

                    <Field label="Variant">
                        <select
                            value={variantId}
                            onChange={(e) => setVariantId(e.target.value)}
                            disabled={!sectionId}
                            data-testid="schedule-creator-variant"
                            className={cn(
                                "w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30",
                                !sectionId && "opacity-50",
                            )}
                        >
                            <option value="">
                                {sectionId ? "Choose a variant…" : "Pick a section first"}
                            </option>
                            {availableVariants.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.label}
                                </option>
                            ))}
                            {sectionId && (
                                <option value={NEW_VARIANT_SENTINEL}>
                                    + Create new variant for this schedule
                                </option>
                            )}
                        </select>
                    </Field>

                    {variantId === NEW_VARIANT_SENTINEL && (
                        <Field label="New variant label">
                            <input
                                type="text"
                                value={newVariantLabel}
                                onChange={(e) => setNewVariantLabel(e.target.value)}
                                placeholder="e.g. 'Black Friday'"
                                data-testid="schedule-creator-new-variant-label"
                                className="w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                A `time_window` variant will be created in this section,
                                wired to the schedule&apos;s start/end times.
                            </p>
                        </Field>
                    )}

                    {formError && (
                        <div
                            data-testid="schedule-creator-error"
                            className="flex items-center gap-2 rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-700 dark:text-rose-300"
                        >
                            <AlertCircle className="h-3.5 w-3.5" />
                            {formError}
                        </div>
                    )}
                </div>

                <footer className="flex justify-end gap-2 border-t border-(--card-border) bg-muted/10 px-5 py-3">
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="schedule-creator-cancel"
                        className="inline-flex h-9 items-center rounded-md px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            void handleSubmit();
                        }}
                        disabled={submitting}
                        data-testid="schedule-creator-submit"
                        className={cn(
                            "inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)",
                            submitting && "opacity-60",
                        )}
                    >
                        {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Create schedule
                    </button>
                </footer>
            </div>
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* Field                                                                 */
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

/* ─────────────────────────────────────────────────────────────────── */
/* Helpers                                                               */
/* ─────────────────────────────────────────────────────────────────── */

function genId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `var_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
