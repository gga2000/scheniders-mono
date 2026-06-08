"use client";

// =====================================================================
// VersionHistoryScreen — settings screen for `store_config_versions`
// =====================================================================
// Two-column layout. Left = scrollable timeline of named + auto-save
// versions. Right = metadata + diff vs the current draft, plus restore
// + promote-to-named actions.
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
    ChevronLeft,
    Circle,
    Loader2,
    Plus,
    RefreshCw,
    Star,
    AlertCircle,
    Check,
    Minus,
    Pencil,
} from "lucide-react";
import type { StoreConfigV2 } from "@scheniders/shared";
import type {
    UseStoreBuilderV2Return,
    StoredVersion,
} from "@/hooks/use-store-builder-v2";
import { cn } from "@/lib/utils";
import {
    diffJson,
    formatPath,
    groupDiffByTop,
    type DiffEntry,
} from "./config-diff";

/* ─────────────────────────────────────────────────────────────────── */
/* Props                                                                */
/* ─────────────────────────────────────────────────────────────────── */

export interface VersionHistoryScreenProps {
    builder: UseStoreBuilderV2Return;
    onClose: () => void;
    /** Test-only — preloaded versions list (skips listVersions call). */
    initialVersions?: StoredVersion[];
}

/* ─────────────────────────────────────────────────────────────────── */
/* Date helpers                                                         */
/* ─────────────────────────────────────────────────────────────────── */

function relativeTime(iso: string): string {
    try {
        const then = new Date(iso).getTime();
        const now = Date.now();
        const delta = now - then;
        if (delta < 0) return "just now";
        const secs = Math.floor(delta / 1000);
        if (secs < 60) return `${secs}s ago`;
        const mins = Math.floor(secs / 60);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 30) return `${days}d ago`;
        const months = Math.floor(days / 30);
        if (months < 12) return `${months}mo ago`;
        const years = Math.floor(days / 365);
        return `${years}y ago`;
    } catch {
        return iso;
    }
}

function absoluteTime(iso: string): string {
    try {
        return new Date(iso).toLocaleString();
    } catch {
        return iso;
    }
}

/* ─────────────────────────────────────────────────────────────────── */
/* Component                                                            */
/* ─────────────────────────────────────────────────────────────────── */

export function VersionHistoryScreen({
    builder,
    onClose,
    initialVersions,
}: VersionHistoryScreenProps): ReactElement {
    const [versions, setVersions] = useState<StoredVersion[] | null>(initialVersions ?? null);
    const [loading, setLoading] = useState<boolean>(!initialVersions);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showSnapshotForm, setShowSnapshotForm] = useState<boolean>(false);
    const [snapshotLabel, setSnapshotLabel] = useState<string>("");
    const [snapshotBusy, setSnapshotBusy] = useState<boolean>(false);
    const [promoteVersion, setPromoteVersion] = useState<StoredVersion | null>(null);
    const [promoteLabel, setPromoteLabel] = useState<string>("");
    const [confirmRestore, setConfirmRestore] = useState<StoredVersion | null>(null);
    const [restoring, setRestoring] = useState<boolean>(false);

    const mountedRef = useRef<boolean>(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    /* ── Load list ─────────────────────────────────────────────── */

    const refresh = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            const rows = await builder.listVersions();
            if (!mountedRef.current) return;
            setVersions(rows);
        } catch (err) {
            if (!mountedRef.current) return;
            setError(err instanceof Error ? err.message : "Failed to load versions");
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [builder]);

    useEffect(() => {
        if (initialVersions !== undefined) return;
        void refresh();
    }, [initialVersions, refresh]);

    /* ── Derived ──────────────────────────────────────────────── */

    const selected = useMemo<StoredVersion | null>(() => {
        if (!selectedId || !versions) return null;
        return versions.find((v) => v.id === selectedId) ?? null;
    }, [selectedId, versions]);

    const diff = useMemo<DiffEntry[] | null>(() => {
        if (!selected) return null;
        try {
            return diffJson(selected.config, builder.config);
        } catch {
            return null;
        }
    }, [builder.config, selected]);

    /* ── Actions ──────────────────────────────────────────────── */

    const handleSaveSnapshot = useCallback(async (): Promise<void> => {
        const label = snapshotLabel.trim();
        if (!label) return;
        setSnapshotBusy(true);
        try {
            await builder.createNamedSnapshot(label);
            setSnapshotLabel("");
            setShowSnapshotForm(false);
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Snapshot failed");
        } finally {
            if (mountedRef.current) setSnapshotBusy(false);
        }
    }, [builder, refresh, snapshotLabel]);

    const handleRestore = useCallback(async (): Promise<void> => {
        if (!confirmRestore) return;
        setRestoring(true);
        try {
            // Apply locally first (instant) then prepend an optimistic auto-save.
            builder.applyConfig(confirmRestore.config);
            const optimistic: StoredVersion = {
                id: `optimistic-${Date.now()}`,
                label: `Restored "${confirmRestore.label ?? "Auto-save"}"`,
                is_named: false,
                config: confirmRestore.config,
                created_at: new Date().toISOString(),
                created_by: "",
                author_name: "You",
            };
            setVersions((prev) => (prev ? [optimistic, ...prev] : [optimistic]));
            setConfirmRestore(null);
            setSelectedId(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Restore failed");
        } finally {
            if (mountedRef.current) setRestoring(false);
        }
    }, [builder, confirmRestore]);

    const handlePromote = useCallback(async (): Promise<void> => {
        if (!promoteVersion) return;
        const label = promoteLabel.trim();
        if (!label) return;
        // Promote = create a brand-new named snapshot from this version's config.
        // (We can't mutate the existing row to flip is_named without a server
        // round-trip outside the spec — a fresh row is simpler and preserves
        // an audit trail.)
        setSnapshotBusy(true);
        try {
            // Temporarily apply, snapshot, then revert. Simpler: insert a row
            // referencing the version's config payload directly via supabase.
            // We use the hook's helper after stashing config.
            const previousConfig: StoreConfigV2 = builder.config;
            builder.applyConfig(promoteVersion.config);
            try {
                await builder.createNamedSnapshot(label);
            } finally {
                builder.applyConfig(previousConfig);
            }
            setPromoteVersion(null);
            setPromoteLabel("");
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Snapshot failed");
        } finally {
            if (mountedRef.current) setSnapshotBusy(false);
        }
    }, [builder, promoteLabel, promoteVersion, refresh]);

    /* ── Render ───────────────────────────────────────────────── */

    return (
        <div
            data-testid="version-history-screen"
            className="flex h-full w-full flex-col bg-background"
        >
            {/* Header */}
            <header className="flex shrink-0 items-center justify-between gap-3 border-b border-(--card-border) bg-(--card-bg) px-5 py-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        data-testid="version-history-back"
                        aria-label="Back"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <h2 className="text-base font-bold tracking-tight">Version History</h2>
                        <p className="text-[11px] text-foreground/80">
                            Restore any previous version of your store. Named snapshots
                            never expire.
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => void refresh()}
                        data-testid="version-history-refresh"
                        className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                        Refresh
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowSnapshotForm((v) => !v)}
                        data-testid="version-history-new"
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        Save snapshot
                    </button>
                </div>
            </header>

            {/* Inline snapshot form */}
            {showSnapshotForm && (
                <div
                    data-testid="version-history-snapshot-form"
                    className="flex shrink-0 items-center gap-2 border-b border-(--card-border) bg-muted/20 px-5 py-3"
                >
                    <input
                        type="text"
                        value={snapshotLabel}
                        onChange={(e) => setSnapshotLabel(e.target.value)}
                        placeholder="Label, e.g. 'Before Eid sale'"
                        data-testid="version-history-snapshot-input"
                        className="flex-1 rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        autoFocus
                    />
                    <button
                        type="button"
                        onClick={() => {
                            void handleSaveSnapshot();
                        }}
                        disabled={!snapshotLabel.trim() || snapshotBusy}
                        data-testid="version-history-snapshot-submit"
                        className={cn(
                            "inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition-opacity",
                            (!snapshotLabel.trim() || snapshotBusy) && "opacity-50",
                        )}
                    >
                        {snapshotBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        Save
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setShowSnapshotForm(false);
                            setSnapshotLabel("");
                        }}
                        data-testid="version-history-snapshot-cancel"
                        className="inline-flex h-8 items-center rounded-md px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {error && (
                <div className="flex shrink-0 items-center gap-2 border-b border-rose-500/20 bg-rose-500/10 px-5 py-2 text-[12px] text-rose-700 dark:text-rose-300">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {error}
                </div>
            )}

            {/* Body */}
            <div className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                {/* Timeline (left) */}
                <aside
                    data-testid="version-history-timeline"
                    className="flex flex-col overflow-y-auto border-r border-(--card-border) bg-(--card-bg)"
                >
                    {loading && !versions ? (
                        <div className="flex h-32 items-center justify-center text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                        </div>
                    ) : !versions || versions.length === 0 ? (
                        <div
                            data-testid="version-history-empty"
                            className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"
                        >
                            <div className="text-sm font-medium">No versions yet</div>
                            <div className="text-[11px] text-foreground/80">
                                Snapshots are created automatically on publish, or you can
                                save a named snapshot right now.
                            </div>
                        </div>
                    ) : (
                        <ul className="divide-y divide-(--card-border)">
                            {versions.map((v) => {
                                const isSelected = v.id === selectedId;
                                const label =
                                    (v.label ?? "").trim() ||
                                    (v.is_named ? "Untitled snapshot" : "Auto-save");
                                return (
                                    <li key={v.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(v.id)}
                                            data-testid={`version-history-row-${v.id}`}
                                            className={cn(
                                                "flex w-full items-start gap-3 px-4 py-3 text-left transition-colors",
                                                isSelected
                                                    ? "bg-primary/10"
                                                    : "hover:bg-black/5",
                                            )}
                                            aria-current={isSelected ? "true" : undefined}
                                        >
                                            <span
                                                className={cn(
                                                    "mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                                                    v.is_named
                                                        ? "bg-amber-500/20 text-amber-600"
                                                        : "bg-muted text-muted-foreground",
                                                )}
                                                data-testid={`version-history-icon-${v.id}`}
                                            >
                                                {v.is_named ? (
                                                    <Star className="h-3 w-3 fill-current" />
                                                ) : (
                                                    <Circle className="h-2 w-2 fill-current" />
                                                )}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="truncate text-sm font-medium">
                                                        {label}
                                                    </span>
                                                </div>
                                                <div
                                                    className="mt-0.5 text-[11px] text-muted-foreground"
                                                    title={absoluteTime(v.created_at)}
                                                >
                                                    {relativeTime(v.created_at)}
                                                    {v.author_name ? ` · ${v.author_name}` : ""}
                                                </div>
                                                {v.diff_summary && (
                                                    <div className="mt-1 flex flex-wrap gap-1">
                                                        {v.diff_summary.added > 0 && (
                                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                                                                <Plus className="h-2.5 w-2.5" />
                                                                {v.diff_summary.added}
                                                            </span>
                                                        )}
                                                        {v.diff_summary.changed > 0 && (
                                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                                                                <Pencil className="h-2.5 w-2.5" />
                                                                {v.diff_summary.changed}
                                                            </span>
                                                        )}
                                                        {v.diff_summary.removed > 0 && (
                                                            <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-medium text-rose-700 dark:text-rose-300">
                                                                <Minus className="h-2.5 w-2.5" />
                                                                {v.diff_summary.removed}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </aside>

                {/* Detail (right) */}
                <section
                    data-testid="version-history-detail"
                    className="flex flex-col overflow-y-auto bg-background"
                >
                    {!selected ? (
                        <div className="flex h-full items-center justify-center p-8 text-center text-sm text-foreground/80">
                            Select a version to view its details and changes.
                        </div>
                    ) : (
                        <div className="space-y-5 p-5">
                            {/* Metadata */}
                            <header className="space-y-1.5">
                                <div className="flex items-center gap-2">
                                    {selected.is_named ? (
                                        <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                                    ) : (
                                        <Circle className="h-3 w-3 fill-muted-foreground text-muted-foreground" />
                                    )}
                                    <h3 className="text-lg font-semibold tracking-tight">
                                        {(selected.label ?? "").trim() ||
                                            (selected.is_named ? "Untitled snapshot" : "Auto-save")}
                                    </h3>
                                </div>
                                <p className="text-[12px] text-muted-foreground">
                                    {absoluteTime(selected.created_at)}
                                    {selected.author_name ? ` · by ${selected.author_name}` : ""}
                                </p>
                            </header>

                            {/* Actions */}
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => setConfirmRestore(selected)}
                                    data-testid="version-history-restore-button"
                                    className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                                >
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    Restore this version
                                </button>
                                {!selected.is_named && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setPromoteVersion(selected);
                                            setPromoteLabel("");
                                        }}
                                        data-testid="version-history-promote-button"
                                        className="inline-flex items-center gap-1 rounded-md border border-(--card-border) px-3 py-1.5 text-[12px] font-semibold transition-colors hover:bg-black/5"
                                    >
                                        <Star className="h-3.5 w-3.5" />
                                        Save as named snapshot
                                    </button>
                                )}
                            </div>

                            {/* Diff */}
                            <DiffView entries={diff ?? []} />
                        </div>
                    )}
                </section>
            </div>

            {/* Restore confirmation */}
            {confirmRestore && (
                <div
                    data-testid="version-history-restore-dialog"
                    role="dialog"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                >
                    <div className="w-full max-w-md rounded-2xl border border-(--card-border) bg-(--card-bg) p-5 shadow-xl">
                        <h4 className="text-base font-semibold tracking-tight">Restore this version?</h4>
                        <p className="mt-2 text-sm text-foreground/80">
                            Restore{" "}
                            <span className="font-medium text-foreground">
                                &quot;{(confirmRestore.label ?? "").trim() ||
                                    (confirmRestore.is_named ? "Untitled snapshot" : "Auto-save")}&quot;
                            </span>{" "}
                            from {absoluteTime(confirmRestore.created_at)}? This replaces
                            your current draft. You can undo this in this session.
                        </p>
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setConfirmRestore(null)}
                                data-testid="version-history-restore-cancel"
                                className="inline-flex h-9 items-center rounded-md px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void handleRestore();
                                }}
                                disabled={restoring}
                                data-testid="version-history-restore-confirm"
                                className={cn(
                                    "inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)",
                                    restoring && "opacity-60",
                                )}
                            >
                                {restoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                Restore
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Promote-to-named modal */}
            {promoteVersion && (
                <div
                    data-testid="version-history-promote-dialog"
                    role="dialog"
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                >
                    <div className="w-full max-w-md rounded-2xl border border-(--card-border) bg-(--card-bg) p-5 shadow-xl">
                        <h4 className="text-base font-semibold tracking-tight">Save as named snapshot</h4>
                        <p className="mt-2 text-sm text-foreground/80">
                            Give this auto-save a memorable label so it doesn&apos;t get
                            pruned.
                        </p>
                        <input
                            type="text"
                            value={promoteLabel}
                            onChange={(e) => setPromoteLabel(e.target.value)}
                            placeholder="Label, e.g. 'Before Eid sale'"
                            data-testid="version-history-promote-input"
                            className="mt-3 w-full rounded-md border border-(--card-border) bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                            autoFocus
                        />
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    setPromoteVersion(null);
                                    setPromoteLabel("");
                                }}
                                data-testid="version-history-promote-cancel"
                                className="inline-flex h-9 items-center rounded-md px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    void handlePromote();
                                }}
                                disabled={!promoteLabel.trim() || snapshotBusy}
                                data-testid="version-history-promote-submit"
                                className={cn(
                                    "inline-flex h-9 items-center gap-1 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)",
                                    (!promoteLabel.trim() || snapshotBusy) && "opacity-60",
                                )}
                            >
                                {snapshotBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                Save snapshot
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/* ─────────────────────────────────────────────────────────────────── */
/* DiffView                                                             */
/* ─────────────────────────────────────────────────────────────────── */

interface DiffViewProps {
    entries: DiffEntry[];
}

function DiffView({ entries }: DiffViewProps): ReactElement {
    const grouped = useMemo(() => groupDiffByTop(entries), [entries]);
    const keys = useMemo(() => Object.keys(grouped).sort(), [grouped]);

    if (entries.length === 0) {
        return (
            <div
                data-testid="version-history-diff-empty"
                className="rounded-xl border border-dashed border-(--card-border) p-6 text-center text-sm text-foreground/80"
            >
                No differences vs your current draft.
            </div>
        );
    }

    return (
        <div data-testid="version-history-diff" className="space-y-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                Changes vs current draft
                <span className="ml-2 text-muted-foreground/60">({entries.length})</span>
            </h4>
            {keys.map((key) => (
                <div key={key} className="rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                        {key}
                    </div>
                    <ul className="space-y-1">
                        {grouped[key].map((e, i) => (
                            <DiffRow key={`${key}-${i}`} entry={e} />
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

function DiffRow({ entry }: { entry: DiffEntry }): ReactElement {
    const tone =
        entry.kind === "added"
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
            : entry.kind === "removed"
              ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";

    const label =
        entry.kind === "added" ? "added" : entry.kind === "removed" ? "removed" : "changed";
    return (
        <li
            data-testid={`version-history-diff-row-${entry.kind}`}
            className={cn(
                "flex flex-col gap-1 rounded-md border px-2.5 py-1.5 text-[12px]",
                tone,
            )}
        >
            <div className="flex items-center gap-2">
                <span className="rounded-sm bg-background/40 px-1 text-[10px] font-semibold uppercase tracking-wider">
                    {label}
                </span>
                <code className="font-mono text-[11px] opacity-90">{formatPath(entry.path)}</code>
            </div>
            {entry.kind === "changed" && (
                <div className="flex flex-col gap-0.5 text-[11px] opacity-80">
                    <div>
                        <span className="font-semibold">before:</span> <code>{previewValue(entry.before)}</code>
                    </div>
                    <div>
                        <span className="font-semibold">after:</span> <code>{previewValue(entry.after)}</code>
                    </div>
                </div>
            )}
        </li>
    );
}

function previewValue(v: unknown): string {
    if (v === undefined) return "undefined";
    if (v === null) return "null";
    if (typeof v === "string") {
        return v.length > 60 ? `"${v.slice(0, 57)}…"` : `"${v}"`;
    }
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    try {
        const s = JSON.stringify(v);
        return s.length > 60 ? `${s.slice(0, 57)}…` : s;
    } catch {
        return "[object]";
    }
}
