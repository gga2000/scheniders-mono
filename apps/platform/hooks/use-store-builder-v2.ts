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
} from "@scheniders/shared";
import { supabase } from "@/lib/supabase";

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
}

export interface UseStoreBuilderV2Return {
    /** Current draft config (in-memory, may differ from server). */
    config: StoreConfigV2;
    /**
     * Update the draft config. The optional `description` is attached to
     * the resulting history entry and surfaces in the undo/redo tooltips.
     * Defaults to "Edit config." when omitted.
     */
    setConfig: (
        next: StoreConfigV2 | ((prev: StoreConfigV2) => StoreConfigV2),
        description?: string,
    ) => void;

    /** Editor UI state. */
    active_page: PageId;
    set_active_page: (p: PageId) => void;
    active_breakpoint: Breakpoint;
    set_active_breakpoint: (b: Breakpoint) => void;
    active_locale: LocaleCode;
    set_active_locale: (l: LocaleCode) => void;

    /** Save state. */
    save_state: SaveStateV2;
    last_saved_at: Date | null;
    has_unpublished_changes: boolean;

    /** Actions. */
    save_draft: () => Promise<void>;
    publish: () => Promise<void>;
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

    /** Append a row to store_config_versions as a named snapshot. */
    createNamedSnapshot: (label: string) => Promise<NamedSnapshot>;

    /** Fetch recent versions for this tenant (50 most recent + all named). */
    listVersions: () => Promise<StoredVersion[]>;

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
    config: StoreConfigV2;
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

function localBackupKey(tenantId: string): string {
    return `schn-builder-v2-${tenantId}`;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Hook                                                                 */
/* ─────────────────────────────────────────────────────────────────── */

export function useStoreBuilderV2(
    options: UseStoreBuilderV2Options,
): UseStoreBuilderV2Return {
    const { tenantId, initialConfig, hasPublished, initiallyDirty = false } = options;

    /* ── Draft config ─────────────────────────────────────────────── */
    const [config, setConfigState] = useState<StoreConfigV2>(initialConfig);

    /* ── Editor UI state ──────────────────────────────────────────── */
    const [active_page, set_active_page] = useState<PageId>("home");
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
     * The label is what we surface in the undo/redo tooltips. The default
     * label is "Edit config." so legacy callers keep working.
     */
    interface HistoryEntry {
        snapshot: StoreConfigV2;
        description: string;
    }
    const DEFAULT_HISTORY_DESCRIPTION = "Edit config.";
    const pastRef = useRef<HistoryEntry[]>([]);
    const futureRef = useRef<HistoryEntry[]>([]);
    const lastSnapshotRef = useRef<string>(JSON.stringify(initialConfig));
    const lastDescriptionRef = useRef<string>(DEFAULT_HISTORY_DESCRIPTION);
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

    /* ── Snapshot to history (debounced) ──────────────────────────── */
    useEffect(() => {
        const serialized = JSON.stringify(config);
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
    }, [config]);

    /* ── Mark dirty whenever config changes ───────────────────────── */
    const initialSerializedRef = useRef<string>(JSON.stringify(initialConfig));
    useEffect(() => {
        const serialized = JSON.stringify(config);
        set_has_unpublished_changes(serialized !== initialSerializedRef.current);
    }, [config]);

    /* ── Auto-save to DB (2s debounce) ────────────────────────────── */
    const saveDraftRef = useRef<((cfg: StoreConfigV2) => Promise<void>) | null>(null);

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
                set_save_state("saved");
                set_last_saved_at(new Date());
                // Drop back to idle after a moment.
                setTimeout(() => {
                    set_save_state((prev) => (prev === "saved" ? "idle" : prev));
                }, 3000);
            } catch {
                set_save_state("error");
            }
        },
        [tenantId],
    );
    saveDraftRef.current = performSaveDraft;

    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => {
        const serialized = JSON.stringify(config);
        if (serialized === initialSerializedRef.current) return;

        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = setTimeout(() => {
            saveDraftRef.current?.(config);
        }, AUTOSAVE_DEBOUNCE_MS);

        return () => {
            if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        };
    }, [config]);

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

    /* ── Actions ──────────────────────────────────────────────────── */

    const save_draft = useCallback(async (): Promise<void> => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        await performSaveDraft(config);
    }, [config, performSaveDraft]);

    const publish = useCallback(async (): Promise<void> => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        set_save_state("saving");
        try {
            const { error } = await supabase
                .from("tenants")
                .update({
                    store_config_v2: config,
                    store_config_v2_draft: null,
                    config_version: 2,
                    updated_at: new Date().toISOString(),
                })
                .eq("id", tenantId);
            if (error) throw error;

            // Snapshot the published config to version history as an
            // auto-save row (is_named=false). Best-effort: failures here
            // don't block publish UX.
            try {
                let authorName: string | null = null;
                let userId: string | null = null;
                const auth = (
                    supabase as unknown as {
                        auth?: { getUser?: () => Promise<{ data?: { user?: { id?: string; email?: string; user_metadata?: Record<string, unknown> } | null } }> };
                    }
                ).auth;
                if (auth?.getUser) {
                    const res = await auth.getUser();
                    const u = res?.data?.user ?? null;
                    if (u) {
                        userId = u.id ?? null;
                        const meta = u.user_metadata ?? {};
                        authorName =
                            (meta as { full_name?: string; name?: string }).full_name ??
                            (meta as { full_name?: string; name?: string }).name ??
                            u.email ??
                            null;
                    }
                }
                await supabase.from("store_config_versions").insert({
                    tenant_id: tenantId,
                    label: null,
                    is_named: false,
                    config,
                    created_by: userId,
                    author_name: authorName,
                });
            } catch {
                /* ignore — best-effort */
            }

            set_save_state("saved");
            set_last_saved_at(new Date());
            initialSerializedRef.current = JSON.stringify(config);
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
        } catch {
            set_save_state("error");
        }
    }, [config, tenantId]);

    const revert_to_published = useCallback(async (): Promise<void> => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
        set_save_state("saving");
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
            set_has_unpublished_changes(false);
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
            // Optimistic in-memory update via the standard setConfig path —
            // this also pushes an undo entry and keeps the debounced full
            // save as a safety net.
            setConfig(
                (prev) =>
                    setByPathRoot(prev as unknown, path, value) as StoreConfigV2,
                "Edited field",
            );
            // Fire-and-forget PATCH. On failure we just log — the next
            // full-config debounced save will reconcile.
            try {
                void fetch("/api/store-config-v2/patch", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        tenant_id: tenantId,
                        is_draft: true,
                        path,
                        value,
                    }),
                }).then((r) => {
                    if (!r.ok) {
                        // eslint-disable-next-line no-console
                        console.warn(
                            "[patchField] PATCH failed, full-save will reconcile",
                            r.status,
                        );
                    }
                }).catch((err) => {
                    // eslint-disable-next-line no-console
                    console.warn("[patchField] PATCH error", err);
                });
            } catch (err) {
                // eslint-disable-next-line no-console
                console.warn("[patchField] PATCH threw", err);
            }
        },
        [setConfig, tenantId],
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
            const { data, error } = await supabase
                .from("store_config_versions")
                .insert({
                    tenant_id: tenantId,
                    label,
                    is_named: true,
                    config,
                    created_by: user_id,
                    author_name,
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
            .select("id, label, is_named, config, diff_summary, created_by, author_name, created_at")
            .eq("tenant_id", tenantId)
            .order("created_at", { ascending: false })
            .limit(50);
        if (recentErr) throw recentErr;

        const { data: named, error: namedErr } = await supabase
            .from("store_config_versions")
            .select("id, label, is_named, config, diff_summary, created_by, author_name, created_at")
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

    const restoreVersion = useCallback(
        async (versionId: string): Promise<void> => {
            const { data, error } = await supabase
                .from("store_config_versions")
                .select("config")
                .eq("id", versionId)
                .single();
            if (error) throw error;
            const next = (data as { config?: StoreConfigV2 } | null)?.config;
            if (!next) throw new Error("Version has no config payload");
            applyConfig(next);
        },
        [applyConfig],
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

    const createSegment = useCallback(
        (input: Omit<AudienceSegment, "id">): AudienceSegment => {
            const segment: AudienceSegment = { ...input, id: genLocalId("seg") };
            setConfigState((prev) => ({
                ...prev,
                segments: [...prev.segments, segment],
            }));
            return segment;
        },
        [],
    );

    const updateSegment = useCallback(
        (id: string, patch: Partial<AudienceSegment>): void => {
            setConfigState((prev) => ({
                ...prev,
                segments: prev.segments.map((s) =>
                    s.id === id ? { ...s, ...patch, id: s.id } : s,
                ),
            }));
        },
        [],
    );

    const deleteSegment = useCallback((id: string): void => {
        setConfigState((prev) => ({
            ...prev,
            segments: prev.segments.filter((s) => s.id !== id),
        }));
    }, []);

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
            setConfigState((prev) => ({
                ...prev,
                experiments: [...prev.experiments, experiment],
            }));
            return experiment;
        },
        [],
    );

    const updateExperiment = useCallback(
        (id: string, patch: Partial<Experiment>): void => {
            setConfigState((prev) => ({
                ...prev,
                experiments: prev.experiments.map((e) =>
                    e.id === id ? { ...e, ...patch, id: e.id } : e,
                ),
            }));
        },
        [],
    );

    const deleteExperiment = useCallback((id: string): void => {
        setConfigState((prev) => ({
            ...prev,
            experiments: prev.experiments.filter((e) => e.id !== id),
        }));
    }, []);

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
            const { data, error } = await supabase
                .from("store_config_experiment_events")
                .select("arm_id, event_type, visitor_key, revenue_iqd")
                .eq("tenant_id", tenantId)
                .eq("experiment_id", experimentId);
            if (error) throw error;
            const rows = (data ?? []) as Array<{
                arm_id: string;
                event_type: string;
                visitor_key: string;
                revenue_iqd: number | null;
            }>;

            // Find the experiment to know which arms exist (so empty arms
            // still show up in the dashboard with zero counts).
            const experiment = config.experiments.find((e) => e.id === experimentId);
            const armIds = new Set<string>(experiment?.arms.map((a) => a.id) ?? []);
            for (const r of rows) armIds.add(r.arm_id);

            const visitorsPerArm = new Map<string, Set<string>>();
            const eventCounts = new Map<string, Map<string, number>>();
            const revenuePerArm = new Map<string, number>();

            for (const armId of armIds) {
                visitorsPerArm.set(armId, new Set());
                eventCounts.set(armId, new Map());
                revenuePerArm.set(armId, 0);
            }

            for (const row of rows) {
                const visitorSet = visitorsPerArm.get(row.arm_id);
                if (visitorSet) visitorSet.add(row.visitor_key);
                const counter = eventCounts.get(row.arm_id);
                if (counter) {
                    counter.set(
                        row.event_type,
                        (counter.get(row.event_type) ?? 0) + 1,
                    );
                }
                if (row.event_type === "order" && typeof row.revenue_iqd === "number") {
                    revenuePerArm.set(
                        row.arm_id,
                        (revenuePerArm.get(row.arm_id) ?? 0) + row.revenue_iqd,
                    );
                }
            }

            const per_arm: Record<string, ExperimentArmStats> = {};
            for (const armId of armIds) {
                const visitors = visitorsPerArm.get(armId)?.size ?? 0;
                const counts = eventCounts.get(armId) ?? new Map();
                // Prefer counting distinct visitors who triggered "view" — but
                // some test fixtures don't emit view events. We fall back to
                // the union of all event visitor_keys (already in visitors).
                const orders = counts.get("order") ?? 0;
                const revenue = revenuePerArm.get(armId) ?? 0;
                per_arm[armId] = {
                    visitors,
                    add_to_cart: counts.get("add_to_cart") ?? 0,
                    checkout_start: counts.get("checkout_start") ?? 0,
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
                    const significant =
                        !needs_more_data && z !== null && z > Z_THRESHOLD;
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
        active_breakpoint,
        set_active_breakpoint,
        active_locale,
        set_active_locale,

        save_state,
        last_saved_at,
        has_unpublished_changes,

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
        createNamedSnapshot,
        listVersions,
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
