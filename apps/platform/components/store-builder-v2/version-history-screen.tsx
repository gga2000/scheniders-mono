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
    groupDiffByTop,
    type DiffEntry,
} from "./config-diff";
import { STRINGS, t, tFormat, type EditorString } from "@/lib/editor-i18n";
import { describeDiffPath, isSecretDiffPath } from "./diff-path-label";
import { useEditorLocale } from "@/lib/editor-locale-context";

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

/** Intl locale tag for an editor locale, with Latin digits (the app's
 *  numerals everywhere else). Kurdish (Sorani) is `ckb`. */
function intlLocale(locale: string): string {
    return `${locale === "ku" ? "ckb" : locale}-u-nu-latn`;
}

function relativeTime(iso: string, locale: string): string {
    const then = new Date(iso).getTime();
    if (!Number.isFinite(then)) return iso;
    const fmt = new Intl.RelativeTimeFormat(intlLocale(locale), { numeric: "auto" });
    const secs = Math.round((then - Date.now()) / 1000);
    const abs = Math.abs(secs);
    if (abs < 60) return fmt.format(secs, "second");
    if (abs < 3600) return fmt.format(Math.round(secs / 60), "minute");
    if (abs < 86400) return fmt.format(Math.round(secs / 3600), "hour");
    if (abs < 30 * 86400) return fmt.format(Math.round(secs / 86400), "day");
    if (abs < 365 * 86400) return fmt.format(Math.round(secs / (30 * 86400)), "month");
    return fmt.format(Math.round(secs / (365 * 86400)), "year");
}

function absoluteTime(iso: string, locale: string): string {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return iso;
    return d.toLocaleString(intlLocale(locale));
}

/* ─────────────────────────────────────────────────────────────────── */
/* Component                                                            */
/* ─────────────────────────────────────────────────────────────────── */

export function VersionHistoryScreen({
    builder,
    onClose,
    initialVersions,
}: VersionHistoryScreenProps): ReactElement {
    const locale = useEditorLocale();
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
            setError(err instanceof Error ? err.message : t(STRINGS.advanced_chrome.vh_error_load, locale));
        } finally {
            if (mountedRef.current) setLoading(false);
        }
    }, [builder, locale]);

    useEffect(() => {
        if (initialVersions !== undefined) return;
        void refresh();
    }, [initialVersions, refresh]);

    /* ── Derived ──────────────────────────────────────────────── */

    const selected = useMemo<StoredVersion | null>(() => {
        if (!selectedId || !versions) return null;
        return versions.find((v) => v.id === selectedId) ?? null;
    }, [selectedId, versions]);

    // EC28: a version's full config is no longer in the list — fetch it on
    // demand only for the selected row (for the diff). Optimistic local rows
    // already carry their config.
    const [selectedConfig, setSelectedConfig] = useState<StoreConfigV2 | null>(null);
    useEffect(() => {
        if (!selected) {
            setSelectedConfig(null);
            return;
        }
        if (selected.config) {
            setSelectedConfig(selected.config);
            return;
        }
        let cancelled = false;
        void builder
            .getVersionConfig(selected.id)
            .then((cfg) => {
                if (!cancelled) setSelectedConfig(cfg);
            })
            .catch(() => {
                if (!cancelled) setSelectedConfig(null);
            });
        return () => {
            cancelled = true;
        };
    }, [selected, builder]);

    const diff = useMemo<DiffEntry[] | null>(() => {
        if (!selected || !selectedConfig) return null;
        try {
            // From the current draft TO this version: each row says what
            // restoring it would do (added = restoring adds it).
            return diffJson(builder.config, selectedConfig);
        } catch {
            return null;
        }
    }, [builder.config, selected, selectedConfig]);

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
            setError(err instanceof Error ? err.message : t(STRINGS.advanced_chrome.vh_error_snapshot, locale));
        } finally {
            if (mountedRef.current) setSnapshotBusy(false);
        }
    }, [builder, locale, refresh, snapshotLabel]);

    const handleRestore = useCallback(async (): Promise<void> => {
        if (!confirmRestore) return;
        setRestoring(true);
        try {
            // EC28: fetch the config on demand (not in the list) unless this is an
            // optimistic local row that already carries it. Apply locally first
            // (instant) then prepend an optimistic auto-save.
            const cfg =
                confirmRestore.config ??
                (await builder.getVersionConfig(confirmRestore.id));
            if (!cfg) throw new Error(t(STRINGS.advanced_chrome.vh_error_no_config, locale));
            builder.applyConfig(cfg);
            const optimistic: StoredVersion = {
                id: `optimistic-${Date.now()}`,
                label: tFormat(STRINGS.advanced_chrome.vh_restored_label, locale, {
                    label: (confirmRestore.label ?? "").trim() || t(STRINGS.version_history.auto_save, locale),
                }),
                is_named: false,
                config: cfg,
                created_at: new Date().toISOString(),
                created_by: "",
                author_name: t(STRINGS.advanced_chrome.vh_you, locale),
            };
            setVersions((prev) => (prev ? [optimistic, ...prev] : [optimistic]));
            setConfirmRestore(null);
            setSelectedId(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : t(STRINGS.advanced_chrome.vh_error_restore, locale));
        } finally {
            if (mountedRef.current) setRestoring(false);
        }
    }, [builder, confirmRestore, locale]);

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
            // EC28: fetch the version's config on demand. Temporarily apply,
            // snapshot, then revert to the editor's current config.
            const cfg =
                promoteVersion.config ??
                (await builder.getVersionConfig(promoteVersion.id));
            if (!cfg) throw new Error(t(STRINGS.advanced_chrome.vh_error_no_config, locale));
            const previousConfig: StoreConfigV2 = builder.config;
            builder.applyConfig(cfg);
            try {
                await builder.createNamedSnapshot(label);
            } finally {
                builder.applyConfig(previousConfig);
            }
            setPromoteVersion(null);
            setPromoteLabel("");
            await refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : t(STRINGS.advanced_chrome.vh_error_snapshot, locale));
        } finally {
            if (mountedRef.current) setSnapshotBusy(false);
        }
    }, [builder, locale, promoteLabel, promoteVersion, refresh]);

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
                        aria-label={t(STRINGS.advanced_chrome.adv_back, locale)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div>
                        <h2 className="text-base font-bold tracking-tight">{t(STRINGS.version_history.heading, locale)}</h2>
                        <p className="text-[11px] text-foreground/80">
                            {t(STRINGS.version_history.subtitle, locale)}
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
                        {t(STRINGS.version_history.refresh, locale)}
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowSnapshotForm((v) => !v)}
                        data-testid="version-history-new"
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground shadow-(--card-shadow) transition-all duration-150 hover:-translate-y-px hover:shadow-(--card-shadow-hover)"
                    >
                        <Plus className="h-3.5 w-3.5" />
                        {t(STRINGS.version_history.save_snapshot, locale)}
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
                        placeholder={t(STRINGS.version_history.snapshot_placeholder, locale)}
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
                        {t(STRINGS.version_history.save, locale)}
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
                        {t(STRINGS.version_history.cancel, locale)}
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
                            dir="auto"
                            className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center"
                        >
                            <div className="text-sm font-medium">
                                {t(STRINGS.advanced_chrome.ver_empty_title, locale)}
                            </div>
                            <div className="text-[11px] text-foreground/80">
                                {t(STRINGS.advanced_chrome.ver_empty_body, locale)}
                            </div>
                        </div>
                    ) : (
                        <ul className="divide-y divide-(--card-border)">
                            {versions.map((v) => {
                                const isSelected = v.id === selectedId;
                                const label =
                                    (v.label ?? "").trim() ||
                                    (v.is_named ? t(STRINGS.version_history.untitled_snapshot, locale) : t(STRINGS.version_history.auto_save, locale));
                                return (
                                    <li key={v.id}>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedId(v.id)}
                                            data-testid={`version-history-row-${v.id}`}
                                            className={cn(
                                                "flex w-full items-start gap-3 px-4 py-3 text-start transition-colors",
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
                                                    title={absoluteTime(v.created_at, locale)}
                                                >
                                                    {relativeTime(v.created_at, locale)}
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
                        <div dir="auto" className="flex h-full items-center justify-center p-8 text-center text-sm text-foreground/80">
                            {t(STRINGS.version_history.select_to_view, locale)}
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
                                            (selected.is_named ? t(STRINGS.version_history.untitled_snapshot, locale) : t(STRINGS.version_history.auto_save, locale))}
                                    </h3>
                                </div>
                                <p className="text-[12px] text-muted-foreground">
                                    {absoluteTime(selected.created_at, locale)}
                                    {selected.author_name
                                        ? ` · ${tFormat(STRINGS.advanced_chrome.vh_by_author, locale, { name: selected.author_name })}`
                                        : ""}
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
                                    {t(STRINGS.version_history.restore, locale)}
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
                                        {t(STRINGS.version_history.save_as_named, locale)}
                                    </button>
                                )}
                            </div>

                            {/* Diff */}
                            <DiffView
                                entries={diff ?? []}
                                configs={selectedConfig ? [builder.config, selectedConfig] : [builder.config]}
                            />
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
                        <h4 className="text-base font-semibold tracking-tight">{t(STRINGS.version_history.restore_title, locale)}</h4>
                        <p className="mt-2 text-sm text-foreground/80">
                            {t(STRINGS.advanced_chrome.vh_restore_body_prefix, locale)}{" "}
                            <span className="font-medium text-foreground">
                                &quot;{(confirmRestore.label ?? "").trim() ||
                                    (confirmRestore.is_named ? t(STRINGS.version_history.untitled_snapshot, locale) : t(STRINGS.version_history.auto_save, locale))}&quot;
                            </span>{" "}
                            {tFormat(STRINGS.advanced_chrome.vh_restore_body_suffix, locale, {
                                time: absoluteTime(confirmRestore.created_at, locale),
                            })}
                        </p>
                        <div className="mt-5 flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setConfirmRestore(null)}
                                data-testid="version-history-restore-cancel"
                                className="inline-flex h-9 items-center rounded-md px-3 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-black/5 hover:text-foreground"
                            >
                                {t(STRINGS.version_history.cancel, locale)}
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
                                {t(STRINGS.version_history.restore_confirm, locale)}
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
                        <h4 className="text-base font-semibold tracking-tight">{t(STRINGS.version_history.save_as_named, locale)}</h4>
                        <p className="mt-2 text-sm text-foreground/80">
                            {t(STRINGS.advanced_chrome.vh_promote_body, locale)}
                        </p>
                        <input
                            type="text"
                            value={promoteLabel}
                            onChange={(e) => setPromoteLabel(e.target.value)}
                            placeholder={t(STRINGS.version_history.snapshot_placeholder, locale)}
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
                                {t(STRINGS.version_history.cancel, locale)}
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
                                {t(STRINGS.version_history.save_snapshot, locale)}
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

/** Plain name for a diff group (the config's top-level field). */
function diffGroupLabel(key: string): EditorString {
    const V = STRINGS.version_history;
    switch (key) {
        case "pages":
            return V.group_pages;
        case "globals":
            return V.group_globals;
        case "brand_kit":
            return V.group_brand_kit;
        case "commerce":
            return V.group_commerce;
        case "default_locale":
        case "enabled_locales":
            return V.group_languages;
        case "custom_pages":
            return V.group_custom_pages;
        case "redirects":
            return V.group_redirects;
        default:
            return V.group_other;
    }
}

interface DiffViewProps {
    entries: DiffEntry[];
    /** Draft + compared version, used to name pages and sections. */
    configs: readonly StoreConfigV2[];
}

function DiffView({ entries, configs }: DiffViewProps): ReactElement {
    const locale = useEditorLocale();
    const grouped = useMemo(() => groupDiffByTop(entries), [entries]);
    const keys = useMemo(() => Object.keys(grouped).sort(), [grouped]);

    if (entries.length === 0) {
        return (
            <div
                data-testid="version-history-diff-empty"
                dir="auto"
                className="rounded-xl border border-dashed border-(--card-border) p-6 text-center text-sm text-foreground/80"
            >
                {t(STRINGS.version_history.diff_empty, locale)}
            </div>
        );
    }

    return (
        <div data-testid="version-history-diff" className="space-y-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                {t(STRINGS.version_history.diff_heading, locale)}
                <span className="ms-2 text-muted-foreground/60">({entries.length})</span>
            </h4>
            {keys.map((key) => (
                <div key={key} className="rounded-xl border border-(--card-border) bg-(--card-bg) p-3">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
                        {t(diffGroupLabel(key), locale)}
                    </div>
                    <ul className="space-y-1">
                        {grouped[key].map((e, i) => (
                            <DiffRow key={`${key}-${i}`} entry={e} configs={configs} />
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
}

function DiffRow({
    entry,
    configs,
}: {
    entry: DiffEntry;
    configs: readonly StoreConfigV2[];
}): ReactElement {
    const locale = useEditorLocale();
    const parts = describeDiffPath(entry.path, configs, locale);
    const where = parts.length > 0 ? parts.join(" › ") : t(diffGroupLabel(entry.path[0] ?? ""), locale);
    const secret = isSecretDiffPath(entry.path);
    const tone =
        entry.kind === "added"
            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
            : entry.kind === "removed"
              ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30"
              : "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";

    const label =
        entry.kind === "added"
            ? t(STRINGS.version_history.diff_added, locale)
            : entry.kind === "removed"
              ? t(STRINGS.version_history.diff_removed, locale)
              : t(STRINGS.version_history.diff_changed, locale);
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
                <span dir="auto" className="text-[12px] font-medium">{where}</span>
            </div>
            {entry.kind === "changed" && (
                <div className="flex flex-col gap-0.5 text-[11px] opacity-80">
                    <div dir="auto">
                        <span className="font-semibold">{t(STRINGS.advanced_chrome.vh_diff_before, locale)}</span>{" "}
                        <code dir="ltr">{secret ? SECRET_MASK : previewValue(entry.before)}</code>
                    </div>
                    <div dir="auto">
                        <span className="font-semibold">{t(STRINGS.advanced_chrome.vh_diff_after, locale)}</span>{" "}
                        <code dir="ltr">{secret ? SECRET_MASK : previewValue(entry.after)}</code>
                    </div>
                </div>
            )}
        </li>
    );
}

const SECRET_MASK = "••••••";

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
