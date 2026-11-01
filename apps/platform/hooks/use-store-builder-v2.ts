"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
    StoreConfigV2,
    PageId,
    Breakpoint,
    LocaleCode,
    NamedSnapshot,
    ScheduledChange,
    AudienceSegment,
    Experiment,
    CustomPage,
} from "@scheniders/shared";
import {
    pruneVariantsForDeletedSegment,
    pruneVariantsForDeletedExperiment,
    findCustomPageById,
} from "@scheniders/shared";
import { supabase } from "@/lib/supabase";
import {
    diffJson,
    summarizeDiff,
    type DiffSummary,
} from "@/components/store-builder-v2/config-diff";

/* ─────────────────────────────────────────────────────────────────── */
/* Experiment stats types                                               */
/* ─────────────────────────────────────────────────────────────────── */

export interface ExperimentArmStats {
    visitors: number;
    add_to_cart: number;
    checkout_start: number;
    orders: number;
    revenue_iqd: number;
    /** orders / visitors */
    conversion_rate: number;
    /** revenue / orders */
    avg_order_value: number;
}

export interface ExperimentArmSignificance {
    z: number | null;
    significant: boolean;
    needs_more_data: boolean;
    /** Percent uplift vs control arm — ((p_arm - p_ctrl) / p_ctrl) * 100. */
    uplift_pct: number;
}

export interface ExperimentStats {
    experiment_id: string;
    per_arm: Record<string, ExperimentArmStats>;
    significance: Record<string, ExperimentArmSignificance>;
}

export interface VariantReference {
    page_id: PageId;
    section_id: string;
    variant_id: string;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Types                                                                */
/* ─────────────────────────────────────────────────────────────────── */

export type SaveStateV2 = "idle" | "saving" | "saved" | "error";

export interface UseStoreBuilderV2Options {
    tenantId: string;
    slug: string;
    /** Initial draft (or published) config the page hydrates with. */
    initialConfig: StoreConfigV2;
    /** Whether a published `store_config_v2` row exists in the DB. */
    hasPublished: boolean;
    /** Whether the initial config came from a draft (so we start dirty). */
    initiallyDirty?: boolean;
    /**
     * EC33: the DB row's `updated_at` (epoch ms) at hydration. A local crash
     * backup is only offered when it's NEWER than this — otherwise the DB has
     * been saved/published since the backup was written (e.g. from another
     * device), so the backup is stale and must not resurrect over newer work.
     */
    initialUpdatedAt?: number | null;
    /** BUG25: published rev counter at hydration; publish rejects a stale base. */
    initialRev?: number;
}

export interface UseStoreBuilderV2Return {
    /** Current draft config (in-memory, may differ from server). */
    config: StoreConfigV2;
    /**
     * Update the draft config. The optional `description` is attached to
     * the resulting history entry and surfaces in the undo/redo tooltips.
     * Omitted → the toolbar shows a locale-aware generic label.
     */
    setConfig: (
        next: StoreConfigV2 | ((prev: StoreConfigV2) => StoreConfigV2),
        description?: string,
    ) => void;

    /** Editor UI state. */
    active_page: PageId;
    set_active_page: (p: PageId) => void;
    /**
     * Custom page currently being authored (id), or null when the canvas is
     * editing the system `active_page`. Setting a system page via
     * `set_active_page` clears this; the two are mutually exclusive edit
     * targets (E4).
     */
    active_custom_page_id: string | null;
    set_active_custom_page_id: (id: string | null) => void;
    /** Resolved custom page for `active_custom_page_id` (null if none/dangling). */
    active_custom_page: CustomPage | null;
    active_breakpoint: Breakpoint;
    set_active_breakpoint: (b: Breakpoint) => void;
    active_locale: LocaleCode;
    set_active_locale: (l: LocaleCode) => void;

    /** Save state. */
    save_state: SaveStateV2;
    last_saved_at: Date | null;
    has_unpublished_changes: boolean;

    /** BUG25: true when the last publish was rejected because another editor
     *  published since this session loaded — the UI should prompt a reload. */
    publish_conflict: boolean;

    /** Actions. */
    save_draft: () => Promise<void>;
    /** Publish the draft. Resolves true on success, false on conflict/error
     *  (so the caller can keep the confirm sheet open + offer a retry). */
    publish: () => Promise<boolean>;
    revert_to_published: () => Promise<void>;

    /** Undo/redo (50-step in-memory ring buffer). */
    undo: () => void;
    redo: () => void;
    can_undo: boolean;
    can_redo: boolean;
    /** Human label describing the action that the next undo would revert. */
    undo_description: string | null;
    /** Human label describing the action that the next redo would re-apply. */
    redo_description: string | null;

    /**
     * Field-level autosave. Optimistically updates the in-memory config
     * at `path` and fires a small PATCH to /api/store-config-v2/patch in
     * the background. The existing full-config debounce remains as a
     * safety net — on a low-bandwidth link this is the fast path.
     */
    patchField: (path: (string | number)[], value: unknown) => void;

    /** Replace the entire draft config (used by version restore). */
    applyConfig: (next: StoreConfigV2) => void;

    /**
     * A newer-than-DB local backup found on mount (crash/close recovery).
     * Non-null only when a localStorage snapshot exists whose config differs
     * from what loaded from the DB. The editor surfaces a restore banner.
     */
    recoverable_backup: { saved_at: number } | null;
    /** Apply the recoverable backup as the current draft (undoable). */
    restore_backup: () => void;
    /** Discard the recoverable backup and clear the banner. */
    dismiss_backup: () => void;

    /** Append a row to store_config_versions as a named snapshot. */
    createNamedSnapshot: (label: string) => Promise<NamedSnapshot>;

    /** Fetch recent versions for this tenant (50 most recent + all named). */
    listVersions: () => Promise<StoredVersion[]>;
    /** EC28: fetch one version's full config on demand (not in listVersions). */
    getVersionConfig: (versionId: string) => Promise<StoreConfigV2 | null>;

    /** Restore a previous version into the draft. */
    restoreVersion: (versionId: string) => Promise<void>;

    /** Schedule CRUD. */
    listSchedules: () => Promise<StoredSchedule[]>;
    createSchedule: (input: Omit<ScheduledChange, "id">) => Promise<StoredSchedule>;
    updateSchedule: (id: string, patch: Partial<ScheduledChange> & { status?: ScheduleStatus }) => Promise<void>;
    cancelSchedule: (id: string) => Promise<void>;
    deleteSchedule: (id: string) => Promise<void>;

    /** Segments CRUD (in-memory; debounced auto-save persists). */
    createSegment: (input: Omit<AudienceSegment, "id">) => AudienceSegment;
    updateSegment: (id: string, patch: Partial<AudienceSegment>) => void;
    deleteSegment: (id: string) => void;
    findSegmentReferences: (segmentId: string) => VariantReference[];

    /** Experiments CRUD (in-memory). */
    createExperiment: (input: Omit<Experiment, "id">) => Experiment;
    updateExperiment: (id: string, patch: Partial<Experiment>) => void;
    deleteExperiment: (id: string) => void;
    findExperimentReferences: (experimentId: string) => VariantReference[];

    /** Experiment stats — aggregated from store_config_experiment_events. */
    fetchExperimentStats: (experimentId: string) => Promise<ExperimentStats>;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Version + schedule row shapes                                        */
/* ─────────────────────────────────────────────────────────────────── */

export type ScheduleStatus = "scheduled" | "active" | "expired" | "cancelled";

export interface StoredVersion extends NamedSnapshot {
    is_named: boolean;
    // EC28: NOT shipped by listVersions anymore (50+ full config blobs = multi-MB
    // payload). Fetched on demand via getVersionConfig(id) for diff/restore/
    // promote. Optimistic local rows may still carry it.
    config?: StoreConfigV2;
}

export interface StoredSchedule extends ScheduledChange {
    status: ScheduleStatus;
    created_at: string;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Constants                                                            */
/* ─────────────────────────────────────────────────────────────────── */

const MAX_HISTORY = 50;
const AUTOSAVE_DEBOUNCE_MS = 2_000;
const LOCALSTORAGE_BACKUP_MS = 30_000;
const HISTORY_DEBOUNCE_MS = 400;
/** Exponential backoff for autosave retries (capped). The last value repeats. */
const SAVE_BACKOFF_MS = [2_000, 5_000, 15_000] as const;

function localBackupKey(tenantId: string): string {
    return `schn-builder-v2-${tenantId}`;
}

/**
 * Count added/removed/changed leaf paths between a serialized baseline config
 * and the next config, for a version row's diff badges. Tolerant of an
 * unparseable/empty baseline (treats it as "everything added").
 */
function computeDiffSummary(
    baselineSerialized: string,
    next: StoreConfigV2,
): DiffSummary {
    let baseline: unknown = {};
    try {
        baseline = JSON.parse(baselineSerialized);
    } catch {
        baseline = {};
    }
    return summarizeDiff(diffJson(baseline, next));
}

/* ─────────────────────────────────────────────────────────────────── */
/* Hook                                                                 */
/* ─────────────────────────────────────────────────────────────────── */

export function useStoreBuilderV2(
    options: UseStoreBuilderV2Options,
): UseStoreBuilderV2Return {
    const {
        tenantId,
        initialConfig,
        hasPublished,
        initiallyDirty = false,
        initialUpdatedAt = null,
        initialRev = 0,
    } = options;

    /* ── Draft config ─────────────────────────────────────────────── */
    const [config, setConfigState] = useState<StoreConfigV2>(initialConfig);

    /* ── BUG25: published-rev optimistic lock ─────────────────────── */
    // The published "generation" we're based on. Advances by 1 on each of our
    // own successful publishes; a mismatch at publish time means another editor
    // got there first → conflict (reject, prompt reload).
    const expectedRevRef = useRef<number>(initialRev);
    const [publish_conflict, set_publish_conflict] = useState<boolean>(false);

    /* ── Editor UI state ──────────────────────────────────────────── */
    const [active_page, _set_active_page] = useState<PageId>("home");
    const [active_custom_page_id, _set_active_custom_page_id] = useState<
        string | null
    >(null);
    // Selecting a system page exits custom-page authoring (mutually exclusive).
    const set_active_page = useCallback((p: PageId): void => {
        _set_active_page(p);
        _set_active_custom_page_id(null);
    }, []);
    const set_active_custom_page_id = useCallback((id: string | null): void => {
        _set_active_custom_page_id(id);
    }, []);
    // Resolved custom page (null when not authoring one, or the id is dangling
    // because the page was deleted while selected — the canvas falls back to
    // the system `active_page` in that case).
    const active_custom_page = useMemo<CustomPage | null>(
        () =>
            active_custom_page_id
                ? (findCustomPageById(config.custom_pages, active_custom_page_id) ??
                  null)
                : null,
        [config.custom_pages, active_custom_page_id],
    );
    const [active_breakpoint, set_active_breakpoint] = useState<Breakpoint>("desktop");
    const [active_locale, set_active_locale] = useState<LocaleCode>(
        initialConfig.default_locale ?? "en",
    );

    /* ── Save state ───────────────────────────────────────────────── */
    const [save_state, set_save_state] = useState<SaveStateV2>("idle");
    const [last_saved_at, set_last_saved_at] = useState<Date | null>(null);
    const [has_unpublished_changes, set_has_unpublished_changes] = useState<boolean>(
        initiallyDirty || !hasPublished,
    );

    /* ── History (undo/redo) ──────────────────────────────────────── */
    /**
     * Each history entry stores the JSON snapshot of the config *plus* a
     * short human label describing the edit (e.g. "Deleted Hero section").
     * The label is what we surface in the undo/redo tooltips. A null
     * label falls back to a locale-aware generic in the toolbar.
     */
    interface HistoryEntry {
        snapshot: StoreConfigV2;
        description: string | null;
    }
    // null → the toolbar falls back to a locale-aware generic label
    // (STRINGS.toolbar.history_generic) instead of hardcoded English.
    const DEFAULT_HISTORY_DESCRIPTION: string | null = null;
    const pastRef = useRef<HistoryEntry[]>([]);
    const futureRef = useRef<HistoryEntry[]>([]);
    const lastSnapshotRef = useRef<string>(JSON.stringify(initialConfig));
    const lastDescriptionRef = useRef<string | null>(DEFAULT_HISTORY_DESCRIPTION);
    /** Description for the *upcoming* commit (set by next setConfig call). */
    const pendingDescriptionRef = useRef<string | null>(null);
    const skipHistoryRef = useRef<boolean>(false);
    const [historyTick, setHistoryTick] = useState<number>(0);

    const setConfig = useCallback(
        (
            next: StoreConfigV2 | ((prev: StoreConfigV2) => StoreConfigV2),
            description?: string,
        ) => {
            if (description !== undefined) {
                pendingDescriptionRef.current = description;
            }
            setConfigState((prev) =>
                typeof next === "function"
                    ? (next as (p: StoreConfigV2) => StoreConfigV2)(prev)
                    : next,
            );
        },
        [],
    );

    // EC27: serialize the config ONCE per change. Three effects below
    // (history snapshot, dirty check, autosave) each used to call
    // JSON.stringify(config) independently — 3× the cost on every keystroke,
    // which janks low-end Android. They now share this memo.
    const serializedConfig = useMemo(() => JSON.stringify(config), [config]);

    /* ── Snapshot to history (debounced) ──────────────────────────── */
    useEffect(() => {
        const serialized = serializedConfig;
        if (serialized === lastSnapshotRef.current) return;

        const timer = setTimeout(() => {
            if (skipHistoryRef.current) {
                skipHistoryRef.current = false;
                lastSnapshotRef.current = serialized;
                pendingDescriptionRef.current = null;
                return;
            }
            try {
                const prevSnap = JSON.parse(lastSnapshotRef.current) as StoreConfigV2;
                pastRef.current.push({
                    snapshot: prevSnap,
                    description: lastDescriptionRef.current,
                });
                if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
                futureRef.current = [];
                lastSnapshotRef.current = serialized;
                lastDescriptionRef.current =
                    pendingDescriptionRef.current ?? DEFAULT_HISTORY_DESCRIPTION;
                pendingDescriptionRef.current = null;
                setHistoryTick((t) => t + 1);
            } catch {
                lastSnapshotRef.current = serialized;
                pendingDescriptionRef.current = null;
            }
        }, HISTORY_DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [serializedConfig]);

    /* ── Mark dirty whenever config changes ───────────────────────── */
    const initialSerializedRef = useRef<string>(JSON.stringify(initialConfig));
    // A never-published store ALWAYS has something to publish — the seeded
    // draft itself. Without this, the effect below would flip the initial
    // `!hasPublished` dirty state back to false on mount (config === load
    // snapshot) and a first-time merchant lands on a disabled Publish button.
    const everPublishedRef = useRef<boolean>(hasPublished);
    // A store that ALREADY HAS a draft also always has something to publish —
    // a draft is unpublished work by definition. Without this the effect below
    // compares the loaded draft against itself on mount, finds no diff, and
    // flips the correct `initiallyDirty` state back to false: a merchant with
    // saved-but-unpublished changes lands on a disabled Publish button and can
    // only escape it by making a throwaway edit. Cleared on publish and on
    // revert, the two points where the draft genuinely stops existing.
    const unpublishedDraftRef = useRef<boolean>(initiallyDirty);
    useEffect(() => {
        set_has_unpublished_changes(
            serializedConfig !== initialSerializedRef.current ||
                !everPublishedRef.current ||
                unpublishedDraftRef.current,
        );
    }, [serializedConfig]);

    /* ── Auto-save to DB (2s debounce) ────────────────────────────── */
    const saveDraftRef = useRef<((cfg: StoreConfigV2) => Promise<void>) | null>(null);

    // True while the current edits have NOT yet been written to the DB draft
    // (a change happened and the debounced autosave hasn't succeeded). Distinct
    // from has_unpublished_changes, which stays true after a draft autosave.
    // Drives the beforeunload guard so we only warn on genuine loss risk.
    const pendingDraftWriteRef = useRef(false);
    // EC9: false until the DB has a full config skeleton (published OR a draft).
    // While false, edits must persist via a FULL config save, never an atomic
    // jsonb_set patch — a patch into a NULL/`{}` base would write only the edited
    // branch (no schema_version / pages array) and corrupt the draft on reload.
    // Flipped true once any full save / publish succeeds.
    const draftSeededRef = useRef<boolean>(hasPublished || initiallyDirty);
    // EC8: the most recent in-flight field PATCH (fire-and-forget). publish /
    // revert AWAIT this before nulling the draft so a late patch can't resurrect
    // a discarded draft via the patch RPC's COALESCE(draft, published) seed —
    // which would re-create a dirty draft holding one stale field after the
    // merchant explicitly reverted or published.
    const inFlightPatchRef = useRef<Promise<void> | null>(null);
    // Always-fresh mirror of `config` for fire-and-forget saves/retries that
    // must persist the LATEST state, not the value captured at schedule time.
    const configRef = useRef(config);
    configRef.current = config;
    // BUG21: set by patchField so the next config-change effect skips the
    // redundant whole-jsonb autosave (the atomic patch already persisted it).
    const suppressAutoSaveRef = useRef(false);
    // G2: pending retry timer + attempt counter for exponential autosave backoff.
    const saveRetryRef = useRef<{
        timer: ReturnType<typeof setTimeout> | null;
        attempt: number;
    }>({ timer: null, attempt: 0 });
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Clears the armed autosave AND the ref, so "is a full save pending?"
    // (patchField success) never reads a cancelled timer as armed.
    const cancelAutoSave = useCallback((): void => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
    }, []);

    const performSaveDraft = useCallback(
        async (cfg: StoreConfigV2): Promise<void> => {
            set_save_state("saving");
            try {
                const { error } = await supabase
                    .from("tenants")
                    .update({
                        store_config_v2_draft: cfg,
                        updated_at: new Date().toISOString(),
                    })
                    .eq("id", tenantId);
                if (error) throw error;
                pendingDraftWriteRef.current = false;
                draftSeededRef.current = true; // EC9: DB now holds a full skeleton.
                // G2: success clears any scheduled retry.
                saveRetryRef.current.attempt = 0;
                if (saveRetryRef.current.timer) {
                    clearTimeout(saveRetryRef.current.timer);
                    saveRetryRef.current.timer = null;
                }
                set_save_state("saved");
                set_last_saved_at(new Date());
                // Drop back to idle after a moment.
                setTimeout(() => {
                    set_save_state((prev) => (prev === "saved" ? "idle" : prev));
                }, 3000);
            } catch {
                set_save_state("error");
                // G2: a single flaky save no longer strands the merchant — keep
                // retrying the LATEST config with exponential backoff while the
                // draft is still unsaved (common on intermittent 3G).
                if (pendingDraftWriteRef.current) {
                    const attempt = saveRetryRef.current.attempt;
                    const delay =
                        SAVE_BACKOFF_MS[
                            Math.min(attempt, SAVE_BACKOFF_MS.length - 1)
                        ];
                    saveRetryRef.current.attempt = attempt + 1;
                    if (saveRetryRef.current.timer) {
                        clearTimeout(saveRetryRef.current.timer);
                    }
                    saveRetryRef.current.timer = setTimeout(() => {
                        saveRetryRef.current.timer = null;
                        // A publish/revert in the meantime clears the pending
                        // flag — don't resurrect a just-cleared draft.
                        if (!pendingDraftWriteRef.current) return;
                        void saveDraftRef.current?.(configRef.current);
                    }, delay);
                }
            }
        },
        [tenantId],
    );
    saveDraftRef.current = performSaveDraft;

    // Arm the debounced full-config save (used as the patchField failure
    // fallback — BUG21). Always saves the latest config via configRef.
    const scheduleReconcileSave = useCallback((): void => {
        pendingDraftWriteRef.current = true;
        cancelAutoSave();
        autoSaveTimerRef.current = setTimeout(() => {
            autoSaveTimerRef.current = null;
            void saveDraftRef.current?.(configRef.current);
        }, AUTOSAVE_DEBOUNCE_MS);
    }, []);
    useEffect(() => {
        // BUG21: this change went through patchField (atomic, advisory-locked
        // patch) — that IS the durable write, so skip the redundant whole-jsonb
        // autosave that would otherwise race and clobber it. patchField manages
        // pendingDraftWriteRef and reconciles via a full save if the patch fails.
        // Consumed first (before the baseline check) so it never lingers into a
        // later structural edit.
        if (suppressAutoSaveRef.current) {
            suppressAutoSaveRef.current = false;
            return;
        }

        if (serializedConfig === initialSerializedRef.current) return;

        // Edits exist that aren't in the DB draft yet — guard against unload.
        // The timer is NOT cleared on re-run: a later patchField edit re-runs
        // this effect and returns early above, and clearing here would drop
        // this structural edit's save (patchField only writes its own field).
        // The timer saves configRef.current, so it always carries every edit.
        pendingDraftWriteRef.current = true;
        cancelAutoSave();
        autoSaveTimerRef.current = setTimeout(() => {
            autoSaveTimerRef.current = null;
            void saveDraftRef.current?.(configRef.current);
        }, AUTOSAVE_DEBOUNCE_MS);
    }, [config, serializedConfig]);

    // Leaving the editor must not leave a timer that writes after unmount.
    useEffect(
        () => () => {
            cancelAutoSave();
        },
        [],
    );

    /* ── localStorage backup (every 30s) ──────────────────────────── */
    useEffect(() => {
        if (typeof window === "undefined") return;
        const interval = setInterval(() => {
            try {
                window.localStorage.setItem(
                    localBackupKey(tenantId),
                    JSON.stringify({ saved_at: Date.now(), config }),
                );
            } catch {
                // Swallow quota / serialization errors.
            }
        }, LOCALSTORAGE_BACKUP_MS);
        return () => clearInterval(interval);
    }, [config, tenantId]);

    /* ── Unsaved-changes unload guard ─────────────────────────────── */
    // When edits haven't reached the DB draft yet (pendingDraftWriteRef),
    // synchronously flush a localStorage backup and prompt the browser's
    // "leave site?" dialog so the last keystrokes within the 2s autosave
    // window aren't silently lost on close/back/refresh (common on flaky 3G).
    useEffect(() => {
        if (typeof window === "undefined") return;
        function onBeforeUnload(e: BeforeUnloadEvent): void {
            if (!pendingDraftWriteRef.current) return;
            try {
                window.localStorage.setItem(
                    localBackupKey(tenantId),
                    JSON.stringify({ saved_at: Date.now(), config }),
                );
            } catch {
                // Swallow quota / serialization errors.
            }
            e.preventDefault();
            // Legacy browsers require returnValue to be set to trigger the prompt.
            e.returnValue = "";
        }
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => window.removeEventListener("beforeunload", onBeforeUnload);
    }, [config, tenantId]);

    /* ── Actions ──────────────────────────────────────────────────── */

    const save_draft = useCallback(async (): Promise<void> => {
        cancelAutoSave();
        await performSaveDraft(config);
    }, [config, performSaveDraft]);

    const publish = useCallback(async (): Promise<boolean> => {
        cancelAutoSave();
        set_save_state("saving");
        // EC8: let any in-flight field PATCH land BEFORE this publish nulls the
        // draft, so a late patch can't resurrect a dirty draft from the freshly
        // published config via the patch RPC's COALESCE seed.
        await inFlightPatchRef.current?.catch(() => {});
        try {
            // Summarise what this publish changes vs the last save point so the
            // inserted version row's diff badges aren't empty. Baseline is the
            // config as of the last publish/load (initialSerializedRef).
            const publishDiff = computeDiffSummary(
                initialSerializedRef.current,
                config,
            );

            // Single atomic RPC: checks membership, asserts schema_version=2,
            // takes an advisory lock, UPDATEs tenants (store_config_v2,
            // store_config_v2_draft=NULL, config_version=2), and INSERTs the
            // version snapshot (with the diff summary) — all in one transaction.
            // Author is computed server-side from auth.users.
            const { error } = await supabase.rpc("publish_store_config_v2", {
                p_tenant_id: tenantId,
                p_config: config,
                p_diff_summary: publishDiff,
                p_expected_rev: expectedRevRef.current,
            });
            if (error) {
                // BUG25: another editor published since we loaded — reject rather
                // than clobber their work, and tell the UI to prompt a reload.
                if (
                    error.code === "40001" ||
                    /config_conflict/i.test(error.message ?? "")
                ) {
                    set_publish_conflict(true);
                    // The DRAFT is intact — an error save-pill would send the
                    // merchant retrying the wrong operation (UX2-04). The
                    // conflict banner owns this failure.
                    set_save_state("idle");
                    return false;
                }
                throw error;
            }

            // Our publish landed; the server bumped rev by 1 — track it so a
            // second publish this session compares against the right base.
            expectedRevRef.current += 1;
            set_publish_conflict(false);
            pendingDraftWriteRef.current = false;
            draftSeededRef.current = true; // EC9: published config is a full skeleton.
            set_save_state("saved");
            set_last_saved_at(new Date());
            initialSerializedRef.current = JSON.stringify(config);
            everPublishedRef.current = true;
            // The draft is nulled server-side by the publish RPC, so it is no
            // longer a standing reason to keep Publish enabled.
            unpublishedDraftRef.current = false;
            set_has_unpublished_changes(false);
            if (typeof window !== "undefined") {
                try {
                    window.localStorage.removeItem(localBackupKey(tenantId));
                } catch {
                    /* ignore */
                }
            }
            setTimeout(() => {
                set_save_state((prev) => (prev === "saved" ? "idle" : prev));
            }, 3000);
            return true;
        } catch (err) {
            console.error("[store-builder-v2] publish failed:", err);
            // Draft is safe; the publish sheet shows its own localized
            // failure state. Don't turn the save pill red (UX2-04).
            set_save_state("idle");
            return false;
        }
    }, [config, tenantId]);

    const revert_to_published = useCallback(async (): Promise<void> => {
        cancelAutoSave();
        set_save_state("saving");
        // EC8: drain any in-flight field PATCH BEFORE we null the draft, so its
        // late landing can't resurrect the very draft we're discarding (the
        // patch RPC seeds a fresh draft from published via COALESCE).
        await inFlightPatchRef.current?.catch(() => {});
        try {
            const { data, error } = await supabase
                .from("tenants")
                .select("store_config_v2")
                .eq("id", tenantId)
                .single();
            if (error) throw error;

            const published =
                (data as { store_config_v2: StoreConfigV2 | null } | null)?.store_config_v2 ?? null;
            if (!published) {
                set_save_state("idle");
                return;
            }

            // Null out the draft on the server.
            const { error: updateError } = await supabase
                .from("tenants")
                .update({ store_config_v2_draft: null, updated_at: new Date().toISOString() })
                .eq("id", tenantId);
            if (updateError) throw updateError;

            skipHistoryRef.current = true;
            setConfigState(published);
            initialSerializedRef.current = JSON.stringify(published);
            everPublishedRef.current = true; // a published config just loaded
            unpublishedDraftRef.current = false; // the draft was discarded
            set_has_unpublished_changes(false);
            // The draft is nulled server-side — stop any pending autosave/retry
            // from resurrecting it.
            pendingDraftWriteRef.current = false;
            suppressAutoSaveRef.current = false;
            if (saveRetryRef.current.timer) {
                clearTimeout(saveRetryRef.current.timer);
                saveRetryRef.current.timer = null;
            }
            saveRetryRef.current.attempt = 0;
            set_save_state("idle");
            set_last_saved_at(new Date());
            pastRef.current = [];
            futureRef.current = [];
            lastSnapshotRef.current = JSON.stringify(published);
            setHistoryTick((t) => t + 1);
        } catch {
            set_save_state("error");
        }
    }, [tenantId]);

    /* ── Undo / Redo ──────────────────────────────────────────────── */

    const undo = useCallback(() => {
        if (pastRef.current.length === 0) return;
        const entry = pastRef.current.pop()!;
        try {
            const current = JSON.parse(lastSnapshotRef.current) as StoreConfigV2;
            futureRef.current.push({
                snapshot: current,
                description: lastDescriptionRef.current,
            });
        } catch {
            /* ignore parse fail */
        }
        lastSnapshotRef.current = JSON.stringify(entry.snapshot);
        lastDescriptionRef.current = entry.description;
        skipHistoryRef.current = true;
        setConfigState(entry.snapshot);
        setHistoryTick((t) => t + 1);
    }, []);

    const redo = useCallback(() => {
        if (futureRef.current.length === 0) return;
        const entry = futureRef.current.pop()!;
        try {
            const current = JSON.parse(lastSnapshotRef.current) as StoreConfigV2;
            pastRef.current.push({
                snapshot: current,
                description: lastDescriptionRef.current,
            });
        } catch {
            /* ignore parse fail */
        }
        lastSnapshotRef.current = JSON.stringify(entry.snapshot);
        lastDescriptionRef.current = entry.description;
        skipHistoryRef.current = true;
        setConfigState(entry.snapshot);
        setHistoryTick((t) => t + 1);
    }, []);

    const can_undo = useMemo(() => pastRef.current.length > 0, [historyTick]);
    const can_redo = useMemo(() => futureRef.current.length > 0, [historyTick]);
    /**
     * The label for the action the next undo would revert is the
     * description of the *top* of the past stack — that snapshot was
     * captured immediately before the current state was committed, with
     * the description tagged to the commit that produced the current state.
     * To keep semantics intuitive ("Undo deleting Hero"), we surface the
     * description of the *current* state (i.e. lastDescriptionRef).
     */
    const undo_description = useMemo<string | null>(
        () => (pastRef.current.length > 0 ? lastDescriptionRef.current : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [historyTick],
    );
    const redo_description = useMemo<string | null>(() => {
        if (futureRef.current.length === 0) return null;
        return futureRef.current[futureRef.current.length - 1].description;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [historyTick]);

    /* ── patchField (field-level autosave fast path) ──────────────── */

    const patchField = useCallback(
        (path: (string | number)[], value: unknown): void => {
            if (path.length === 0) return;
            // EC9: until the DB holds a full config skeleton, an atomic jsonb_set
            // patch would corrupt the draft (writes only this branch into a NULL
            // base). Persist the FULL config via the debounced save instead. This
            // path keeps running until a full save succeeds (draftSeededRef flips
            // true), then the fast patch path below takes over.
            if (!draftSeededRef.current) {
                setConfig(
                    (prev) =>
                        setByPathRoot(prev as unknown, path, value) as StoreConfigV2,
                    "Edited field",
                );
                scheduleReconcileSave();
                return;
            }
            // BUG21: the atomic patch below is the durable write, so suppress
            // the redundant whole-jsonb autosave the optimistic setConfig would
            // trigger (it raced/clobbered the patch). Mark the write in-flight
            // until the patch confirms; the failure paths reconcile.
            suppressAutoSaveRef.current = true;
            pendingDraftWriteRef.current = true;
            // Optimistic in-memory update via the standard setConfig path —
            // this also pushes an undo entry.
            setConfig(
                (prev) =>
                    setByPathRoot(prev as unknown, path, value) as StoreConfigV2,
                "Edited field",
            );
            // Fire-and-forget PATCH. On success the draft is persisted; on
            // failure, fall back to a full debounced save (configRef = latest).
            try {
                const patchPromise = fetch("/api/store-config-v2/patch", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        tenant_id: tenantId,
                        is_draft: true,
                        path,
                        value,
                    }),
                }).then((r) => {
                    if (r.ok) {
                        // A full save armed by an earlier structural edit still
                        // owns the pending flag: this patch only wrote one field.
                        if (!autoSaveTimerRef.current) pendingDraftWriteRef.current = false;
                    } else {
                        // eslint-disable-next-line no-console
                        console.warn(
                            "[patchField] PATCH failed, full-save will reconcile",
                            r.status,
                        );
                        scheduleReconcileSave();
                    }
                }).catch((err) => {
                    // eslint-disable-next-line no-console
                    console.warn("[patchField] PATCH error", err);
                    scheduleReconcileSave();
                });
                // EC8: track this patch so revert/publish can await it before
                // nulling the draft (otherwise its late landing resurrects one).
                inFlightPatchRef.current = patchPromise;
                void patchPromise.finally(() => {
                    if (inFlightPatchRef.current === patchPromise) {
                        inFlightPatchRef.current = null;
                    }
                });
            } catch (err) {
                // eslint-disable-next-line no-console
                console.warn("[patchField] PATCH threw", err);
                scheduleReconcileSave();
            }
        },
        [setConfig, tenantId, scheduleReconcileSave],
    );

    /* ── applyConfig (replace entire draft, e.g. version restore) ── */

    const applyConfig = useCallback((next: StoreConfigV2): void => {
        try {
            const current = JSON.parse(lastSnapshotRef.current) as StoreConfigV2;
            pastRef.current.push({
                snapshot: current,
                description: lastDescriptionRef.current,
            });
            if (pastRef.current.length > MAX_HISTORY) pastRef.current.shift();
            futureRef.current = [];
        } catch {
            /* ignore parse fail */
        }
        lastSnapshotRef.current = JSON.stringify(next);
        lastDescriptionRef.current = "Restore version.";
        skipHistoryRef.current = true;
        setConfigState(next);
        setHistoryTick((t) => t + 1);
    }, []);

    /* ── Crash-recovery: detect a newer local backup on mount ─────── */
    const [recoverableBackup, setRecoverableBackup] = useState<{
        saved_at: number;
        config: StoreConfigV2;
    } | null>(null);
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const raw = window.localStorage.getItem(localBackupKey(tenantId));
            if (!raw) return;
            const parsed = JSON.parse(raw) as {
                saved_at?: number;
                config?: StoreConfigV2;
            };
            if (!parsed?.config || typeof parsed.saved_at !== "number") return;
            // EC33: the backup is keyed only by tenant, so it can belong to an
            // OLDER session than what's now in the DB (e.g. another device saved
            // or published since). If the DB was updated at/after the backup's
            // timestamp, the backup is stale — drop it rather than offer to
            // resurrect it over newer work.
            if (
                typeof initialUpdatedAt === "number" &&
                parsed.saved_at <= initialUpdatedAt
            ) {
                window.localStorage.removeItem(localBackupKey(tenantId));
                return;
            }
            // Only offer recovery when the backup actually diverges from what
            // we hydrated from the DB — otherwise it's a stale duplicate.
            if (JSON.stringify(parsed.config) === initialSerializedRef.current) {
                window.localStorage.removeItem(localBackupKey(tenantId));
                return;
            }
            setRecoverableBackup({ saved_at: parsed.saved_at, config: parsed.config });
        } catch {
            // Corrupt backup — drop it.
            try {
                window.localStorage.removeItem(localBackupKey(tenantId));
            } catch {
                /* ignore */
            }
        }
        // Mount-only: we compare against the DB-hydrated baseline once.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const restore_backup = useCallback((): void => {
        setRecoverableBackup((b) => {
            if (b) applyConfig(b.config);
            return null;
        });
    }, [applyConfig]);

    const dismiss_backup = useCallback((): void => {
        setRecoverableBackup(null);
        if (typeof window !== "undefined") {
            try {
                window.localStorage.removeItem(localBackupKey(tenantId));
            } catch {
                /* ignore */
            }
        }
    }, [tenantId]);

    /* ── Version / schedule CRUD helpers ────────────────────────── */

    const getAuthorInfo = useCallback(async (): Promise<{ user_id: string | null; author_name: string | null }> => {
        try {
            const auth = (
                supabase as unknown as {
                    auth?: { getUser?: () => Promise<{ data?: { user?: { id?: string; email?: string; user_metadata?: Record<string, unknown> } | null } }> };
                }
            ).auth;
            if (!auth?.getUser) return { user_id: null, author_name: null };
            const res = await auth.getUser();
            const u = res?.data?.user ?? null;
            if (!u) return { user_id: null, author_name: null };
            const meta = (u.user_metadata ?? {}) as { full_name?: string; name?: string };
            return {
                user_id: u.id ?? null,
                author_name: meta.full_name ?? meta.name ?? u.email ?? null,
            };
        } catch {
            return { user_id: null, author_name: null };
        }
    }, []);

    const createNamedSnapshot = useCallback(
        async (label: string): Promise<NamedSnapshot> => {
            const { user_id, author_name } = await getAuthorInfo();
            // Populate the diff badge: changes in this snapshot vs the last
            // save point (otherwise the version-history row renders empty).
            const diff_summary = computeDiffSummary(
                initialSerializedRef.current,
                config,
            );
            const { data, error } = await supabase
                .from("store_config_versions")
                .insert({
                    tenant_id: tenantId,
                    label,
                    is_named: true,
                    config,
                    created_by: user_id,
                    author_name,
                    diff_summary,
                })
                .select("id, label, created_at, created_by, author_name, diff_summary")
                .single();
            if (error) throw error;
            const row = (data ?? {}) as {
                id?: string;
                label?: string;
                created_at?: string;
                created_by?: string;
                author_name?: string;
                diff_summary?: { added: number; removed: number; changed: number };
            };
            return {
                id: row.id ?? crypto.randomUUID(),
                label: row.label ?? label,
                created_at: row.created_at ?? new Date().toISOString(),
                created_by: row.created_by ?? user_id ?? "",
                author_name: row.author_name ?? author_name ?? "",
                diff_summary: row.diff_summary,
            };
        },
        [config, getAuthorInfo, tenantId],
    );

    const listVersions = useCallback(async (): Promise<StoredVersion[]> => {
        // 50 most recent overall, plus any named snapshot not in that window.
        const { data: recent, error: recentErr } = await supabase
            .from("store_config_versions")
            .select("id, label, is_named, diff_summary, created_by, author_name, created_at")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(50);
        if (recentErr) throw recentErr;

        const { data: named, error: namedErr } = await supabase
            .from("store_config_versions")
            .select("id, label, is_named, diff_summary, created_by, author_name, created_at")
            .eq("tenant_id", tenantId)
            .eq("is_named", true)
            .order("created_at", { ascending: false });
        if (namedErr) throw namedErr;

        const rows = [...((recent ?? []) as unknown as StoredVersion[]), ...((named ?? []) as unknown as StoredVersion[])];
        const seen = new Set<string>();
        const unique: StoredVersion[] = [];
        for (const r of rows) {
            if (!r?.id || seen.has(r.id)) continue;
            seen.add(r.id);
            unique.push(r);
        }
        unique.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        return unique;
    }, [tenantId]);

    // EC28: fetch ONE version's full config on demand (listVersions no longer
    // ships them). Used by the version-history diff/restore/promote flows.
    const getVersionConfig = useCallback(
        async (versionId: string): Promise<StoreConfigV2 | null> => {
            const { data, error } = await supabase
                .from("store_config_versions")
                .select("config")
                .eq("id", versionId)
                .single();
            if (error) throw error;
            return (data as { config?: StoreConfigV2 } | null)?.config ?? null;
        },
        [],
    );

    const restoreVersion = useCallback(
        async (versionId: string): Promise<void> => {
            const next = await getVersionConfig(versionId);
            if (!next) throw new Error("Version has no config payload");
            applyConfig(next);
        },
        [applyConfig, getVersionConfig],
    );

    const listSchedules = useCallback(async (): Promise<StoredSchedule[]> => {
        const { data, error } = await supabase
            .from("store_config_schedules")
            .select("id, label, starts_at, ends_at, timezone, targets, status, created_at")
            .eq("tenant_id", tenantId)
            .order("starts_at", { ascending: false });
        if (error) throw error;
        const rows = (data ?? []) as Array<{
            id: string;
            label: string;
            starts_at: string;
            ends_at: string | null;
            timezone: string;
            targets: ScheduledChange["targets"];
            status: ScheduleStatus;
            created_at: string;
        }>;
        return rows.map((r) => ({
            id: r.id,
            label: r.label,
            starts_at_iso: r.starts_at,
            ends_at_iso: r.ends_at ?? undefined,
            timezone: r.timezone,
            targets: r.targets,
            status: r.status,
            created_at: r.created_at,
        }));
    }, [tenantId]);

    const createSchedule = useCallback(
        async (input: Omit<ScheduledChange, "id">): Promise<StoredSchedule> => {
            const { user_id } = await getAuthorInfo();
            const now = new Date();
            const startsAt = new Date(input.starts_at_iso);
            const endsAt = input.ends_at_iso ? new Date(input.ends_at_iso) : null;
            let status: ScheduleStatus = "scheduled";
            if (startsAt <= now && (!endsAt || endsAt > now)) status = "active";
            else if (endsAt && endsAt <= now) status = "expired";

            const { data, error } = await supabase
                .from("store_config_schedules")
                .insert({
                    tenant_id: tenantId,
                    label: input.label,
                    starts_at: input.starts_at_iso,
                    ends_at: input.ends_at_iso ?? null,
                    timezone: input.timezone,
                    targets: input.targets,
                    status,
                    created_by: user_id,
                })
                .select("id, label, starts_at, ends_at, timezone, targets, status, created_at")
                .single();
            if (error) throw error;
            const row = (data ?? {}) as {
                id: string;
                label: string;
                starts_at: string;
                ends_at: string | null;
                timezone: string;
                targets: ScheduledChange["targets"];
                status: ScheduleStatus;
                created_at: string;
            };
            return {
                id: row.id,
                label: row.label,
                starts_at_iso: row.starts_at,
                ends_at_iso: row.ends_at ?? undefined,
                timezone: row.timezone,
                targets: row.targets,
                status: row.status,
                created_at: row.created_at,
            };
        },
        [getAuthorInfo, tenantId],
    );

    const updateSchedule = useCallback(
        async (id: string, patch: Partial<ScheduledChange> & { status?: ScheduleStatus }): Promise<void> => {
            const updates: Record<string, unknown> = {};
            if (patch.label !== undefined) updates.label = patch.label;
            if (patch.starts_at_iso !== undefined) updates.starts_at = patch.starts_at_iso;
            if (patch.ends_at_iso !== undefined) updates.ends_at = patch.ends_at_iso ?? null;
            if (patch.timezone !== undefined) updates.timezone = patch.timezone;
            if (patch.targets !== undefined) updates.targets = patch.targets;
            if (patch.status !== undefined) updates.status = patch.status;
            const { error } = await supabase
                .from("store_config_schedules")
                .update(updates)
                .eq("id", id);
            if (error) throw error;
        },
        [],
    );

    const cancelSchedule = useCallback(
        async (id: string): Promise<void> => {
            const { error } = await supabase
                .from("store_config_schedules")
                .update({ status: "cancelled" })
                .eq("id", id);
            if (error) throw error;
        },
        [],
    );

    const deleteSchedule = useCallback(
        async (id: string): Promise<void> => {
            const { error } = await supabase
                .from("store_config_schedules")
                .delete()
                .eq("id", id);
            if (error) throw error;
        },
        [],
    );

    /* ── Segments CRUD ─────────────────────────────────────────────── */

    // EC31: segment/experiment CRUD now flows through the atomic, advisory-locked
    // `patchField` (jsonb_set on the specific top-level key) instead of a bare
    // setConfigState that rode the racy whole-jsonb autosave — closing the
    // lost-update window for a concurrent edit on another tab/section.
    const createSegment = useCallback(
        (input: Omit<AudienceSegment, "id">): AudienceSegment => {
            const segment: AudienceSegment = { ...input, id: genLocalId("seg") };
            patchField(["segments"], [...configRef.current.segments, segment]);
            return segment;
        },
        [patchField],
    );

    const updateSegment = useCallback(
        (id: string, patch: Partial<AudienceSegment>): void => {
            const next = configRef.current.segments.map((s) =>
                s.id === id ? { ...s, ...patch, id: s.id } : s,
            );
            patchField(["segments"], next);
        },
        [patchField],
    );

    const deleteSegment = useCallback(
        (id: string): void => {
            const cur = configRef.current;
            patchField(
                ["segments"],
                cur.segments.filter((s) => s.id !== id),
            );
            // EC20: cascade-remove variants that targeted this segment — they can
            // never match again, so leaving them is a silent orphan.
            const { pages, removed } = pruneVariantsForDeletedSegment(cur.pages, id);
            if (removed > 0) patchField(["pages"], pages);
        },
        [patchField],
    );

    const findSegmentReferences = useCallback(
        (segmentId: string): VariantReference[] => {
            const refs: VariantReference[] = [];
            for (const page of config.pages) {
                for (const section of page.sections) {
                    for (const variant of section.variants ?? []) {
                        for (const cond of variant.conditions) {
                            if (
                                cond.kind === "audience" &&
                                cond.segment_id === segmentId
                            ) {
                                refs.push({
                                    page_id: page.page_id,
                                    section_id: section.id,
                                    variant_id: variant.id,
                                });
                                break;
                            }
                        }
                    }
                }
            }
            return refs;
        },
        [config.pages],
    );

    /* ── Experiments CRUD ──────────────────────────────────────────── */

    const createExperiment = useCallback(
        (input: Omit<Experiment, "id">): Experiment => {
            const experiment: Experiment = { ...input, id: genLocalId("exp") };
            patchField(["experiments"], [
                ...configRef.current.experiments,
                experiment,
            ]);
            return experiment;
        },
        [patchField],
    );

    const updateExperiment = useCallback(
        (id: string, patch: Partial<Experiment>): void => {
            const next = configRef.current.experiments.map((e) =>
                e.id === id ? { ...e, ...patch, id: e.id } : e,
            );
            patchField(["experiments"], next);
        },
        [patchField],
    );

    const deleteExperiment = useCallback(
        (id: string): void => {
            const cur = configRef.current;
            patchField(
                ["experiments"],
                cur.experiments.filter((e) => e.id !== id),
            );
            // EC20: cascade-remove variants gated on this experiment's arms.
            const { pages, removed } = pruneVariantsForDeletedExperiment(
                cur.pages,
                id,
            );
            if (removed > 0) patchField(["pages"], pages);
        },
        [patchField],
    );

    const findExperimentReferences = useCallback(
        (experimentId: string): VariantReference[] => {
            const refs: VariantReference[] = [];
            for (const page of config.pages) {
                for (const section of page.sections) {
                    for (const variant of section.variants ?? []) {
                        for (const cond of variant.conditions) {
                            if (
                                cond.kind === "ab_test" &&
                                cond.experiment_id === experimentId
                            ) {
                                refs.push({
                                    page_id: page.page_id,
                                    section_id: section.id,
                                    variant_id: variant.id,
                                });
                                break;
                            }
                        }
                    }
                }
            }
            return refs;
        },
        [config.pages],
    );

    /* ── Experiment stats ─────────────────────────────────────────── */

    const fetchExperimentStats = useCallback(
        async (experimentId: string): Promise<ExperimentStats> => {
            // EC28: aggregate server-side (one row per arm) instead of streaming
            // every event row to the browser (multi-MB / OOM on a popular test).
            const { data, error } = await supabase.rpc("aggregate_experiment_stats", {
                p_tenant_id: tenantId,
                p_experiment_id: experimentId,
            });
            if (error) throw error;
            // The shared client isn't generic-typed, so cast the RPC result
            // (matches this file's convention for every supabase read).
            const rows = (data ?? []) as Array<{
                arm_id: string;
                visitors: number;
                add_to_cart: number;
                checkout_start: number;
                orders: number;
                revenue_iqd: number;
            }>;

            // Find the experiment to know which arms exist (so empty arms still
            // show up in the dashboard with zero counts).
            const experiment = config.experiments.find((e) => e.id === experimentId);
            const armIds = new Set<string>(experiment?.arms.map((a) => a.id) ?? []);
            for (const r of rows) armIds.add(r.arm_id);
            const byArm = new Map(rows.map((r) => [r.arm_id, r]));

            const per_arm: Record<string, ExperimentArmStats> = {};
            for (const armId of armIds) {
                const r = byArm.get(armId);
                // Postgres bigint/numeric may arrive as string — coerce.
                const visitors = Number(r?.visitors ?? 0);
                const orders = Number(r?.orders ?? 0);
                const revenue = Number(r?.revenue_iqd ?? 0);
                per_arm[armId] = {
                    visitors,
                    add_to_cart: Number(r?.add_to_cart ?? 0),
                    checkout_start: Number(r?.checkout_start ?? 0),
                    orders,
                    revenue_iqd: revenue,
                    conversion_rate: visitors > 0 ? orders / visitors : 0,
                    avg_order_value: orders > 0 ? revenue / orders : 0,
                };
            }

            // Control arm = first arm in the experiment definition (or first
            // arm id alphabetically if no experiment is found).
            const controlArmId =
                experiment?.arms[0]?.id ?? Array.from(armIds).sort()[0] ?? null;
            const significance: Record<string, ExperimentArmSignificance> = {};
            const MIN_PER_ARM = 100;
            const Z_THRESHOLD = 1.96;
            if (controlArmId) {
                const ctrl = per_arm[controlArmId];
                for (const armId of Object.keys(per_arm)) {
                    if (armId === controlArmId) {
                        significance[armId] = {
                            z: null,
                            significant: false,
                            needs_more_data: false,
                            uplift_pct: 0,
                        };
                        continue;
                    }
                    const arm = per_arm[armId];
                    const needs_more_data =
                        arm.visitors < MIN_PER_ARM ||
                        ctrl.visitors < MIN_PER_ARM;
                    const p1 = arm.conversion_rate;
                    const p2 = ctrl.conversion_rate;
                    let z: number | null = null;
                    if (arm.visitors > 0 && ctrl.visitors > 0) {
                        const pooled =
                            (arm.orders + ctrl.orders) /
                            (arm.visitors + ctrl.visitors);
                        const se = Math.sqrt(
                            pooled *
                                (1 - pooled) *
                                (1 / arm.visitors + 1 / ctrl.visitors),
                        );
                        z = se > 0 ? (p1 - p2) / se : null;
                    }
                    // Two-sided test: a variant that is significantly WORSE
                    // (z < -1.96) is just as "significant" as a better one.
                    // Direction (winning vs losing) is read from the sign of z
                    // / uplift downstream — gating on z > 1.96 made "losing"
                    // mathematically unreachable.
                    const significant =
                        !needs_more_data &&
                        z !== null &&
                        Math.abs(z) > Z_THRESHOLD;
                    const uplift_pct = p2 > 0 ? ((p1 - p2) / p2) * 100 : 0;
                    significance[armId] = {
                        z,
                        significant,
                        needs_more_data,
                        uplift_pct,
                    };
                }
            }

            return { experiment_id: experimentId, per_arm, significance };
        },
        [config.experiments, tenantId],
    );

    return {
        config,
        setConfig,

        active_page,
        set_active_page,
        active_custom_page_id,
        set_active_custom_page_id,
        active_custom_page,
        active_breakpoint,
        set_active_breakpoint,
        active_locale,
        set_active_locale,

        save_state,
        last_saved_at,
        has_unpublished_changes,

        publish_conflict,
        save_draft,
        publish,
        revert_to_published,

        undo,
        redo,
        can_undo,
        can_redo,
        undo_description,
        redo_description,

        patchField,
        applyConfig,
        recoverable_backup: recoverableBackup
            ? { saved_at: recoverableBackup.saved_at }
            : null,
        restore_backup,
        dismiss_backup,
        createNamedSnapshot,
        listVersions,
        getVersionConfig,
        restoreVersion,
        listSchedules,
        createSchedule,
        updateSchedule,
        cancelSchedule,
        deleteSchedule,

        createSegment,
        updateSegment,
        deleteSegment,
        findSegmentReferences,

        createExperiment,
        updateExperiment,
        deleteExperiment,
        findExperimentReferences,

        fetchExperimentStats,
    };
}

/* ─────────────────────────────────────────────────────────────────── */
/* Immutable clone-and-set helper for patchField.                       */
/* Mirrors the route handler's setByPath — see                          */
/* apps/platform/app/api/store-config-v2/patch/route.ts                 */
/* ─────────────────────────────────────────────────────────────────── */

function setByPathRoot(
    root: unknown,
    path: (string | number)[],
    value: unknown,
): unknown {
    if (path.length === 0) return value;
    const cloneContainer = (
        val: unknown,
        nextKey: string | number,
    ): Record<string, unknown> | unknown[] => {
        if (typeof nextKey === "number") {
            return Array.isArray(val) ? val.slice() : [];
        }
        if (val && typeof val === "object" && !Array.isArray(val)) {
            return { ...(val as Record<string, unknown>) };
        }
        return {};
    };
    const nextRoot = cloneContainer(root, path[0]);
    let cur: Record<string, unknown> | unknown[] = nextRoot;
    for (let i = 0; i < path.length - 1; i++) {
        const key = path[i];
        const nextKey = path[i + 1];
        const child = (cur as Record<string | number, unknown>)[key as never];
        const cloned = cloneContainer(child, nextKey);
        (cur as Record<string | number, unknown>)[key as never] = cloned;
        cur = cloned;
    }
    (cur as Record<string | number, unknown>)[path[path.length - 1] as never] =
        value;
    return nextRoot;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Local-only id generator (segments/experiments are persisted as part  */
/* of StoreConfigV2 — they don't need DB-issued ids).                   */
/* ─────────────────────────────────────────────────────────────────── */

function genLocalId(prefix: string): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `${prefix}_${crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
