/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    render,
    screen,
    fireEvent,
    cleanup,
    waitFor,
} from "@testing-library/react";
import type { PageId, Breakpoint, LocaleCode, StoreConfigV2 } from "@scheniders/shared";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import type {
    UseStoreBuilderV2Return,
    StoredVersion,
} from "@/hooks/use-store-builder-v2";

// Stub supabase client (the hook imports it at module load).
vi.mock("@/lib/supabase", () => ({
    supabase: {
        from: () => ({
            insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
        }),
    },
}));

import { VersionHistoryScreen } from "./version-history-screen";

/* ─────────────────────────────────────────────────────────────────── */
/* Mock builder                                                         */
/* ─────────────────────────────────────────────────────────────────── */

function makeBuilder(
    overrides: Partial<UseStoreBuilderV2Return> = {},
): UseStoreBuilderV2Return {
    const config: StoreConfigV2 = emptyStoreConfigV2();
    const noop = () => {};
    const asyncNoop = async () => {};
    return {
        config,
        setConfig: noop,
        patchField: noop,
        active_page: "home" as PageId,
        set_active_page: noop,
        active_breakpoint: "desktop" as Breakpoint,
        set_active_breakpoint: noop,
        active_locale: "en" as LocaleCode,
        set_active_locale: noop,
        save_state: "idle",
        last_saved_at: null,
        has_unpublished_changes: false,
        save_draft: asyncNoop,
        publish: asyncNoop,
        revert_to_published: asyncNoop,
        undo: noop,
        redo: noop,
        can_undo: false,
        can_redo: false,
        undo_description: null,
        redo_description: null,
        applyConfig: noop,
        createNamedSnapshot: async (label: string) => ({
            id: `v-${Date.now()}`,
            label,
            created_at: new Date().toISOString(),
            created_by: "",
            author_name: "",
        }),
        listVersions: async () => [],
        restoreVersion: async () => {},
        listSchedules: async () => [],
        createSchedule: async () => ({
            id: "s0",
            label: "noop",
            starts_at_iso: new Date().toISOString(),
            timezone: "Asia/Baghdad",
            targets: [],
            status: "scheduled",
            created_at: new Date().toISOString(),
        }),
        updateSchedule: async () => {},
        cancelSchedule: async () => {},
        deleteSchedule: async () => {},
        createSegment: (input) => ({ ...input, id: "seg_test" }),
        updateSegment: () => {},
        deleteSegment: () => {},
        findSegmentReferences: () => [],
        createExperiment: (input) => ({ ...input, id: "exp_test" }),
        updateExperiment: () => {},
        deleteExperiment: () => {},
        findExperimentReferences: () => [],
        fetchExperimentStats: async (experimentId) => ({
            experiment_id: experimentId,
            per_arm: {},
            significance: {},
        }),
        ...overrides,
    };
}

function makeVersion(
    overrides: Partial<StoredVersion> = {},
): StoredVersion {
    return {
        id: overrides.id ?? `v-${Math.random().toString(36).slice(2, 8)}`,
        label: overrides.label ?? null as unknown as string,
        is_named: overrides.is_named ?? false,
        config: overrides.config ?? emptyStoreConfigV2(),
        created_at: overrides.created_at ?? new Date(Date.now() - 60_000).toISOString(),
        created_by: overrides.created_by ?? "user-1",
        author_name: overrides.author_name ?? "Test Author",
        diff_summary: overrides.diff_summary,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

/* ─────────────────────────────────────────────────────────────────── */
/* Tests                                                                */
/* ─────────────────────────────────────────────────────────────────── */

describe("VersionHistoryScreen", () => {
    it("renders empty state when there are no versions", () => {
        const builder = makeBuilder();
        render(
            <VersionHistoryScreen
                builder={builder}
                onClose={() => {}}
                initialVersions={[]}
            />,
        );
        expect(screen.getByTestId("version-history-screen")).toBeTruthy();
        expect(screen.getByTestId("version-history-empty")).toBeTruthy();
    });

    it("renders three versions with their labels", () => {
        const builder = makeBuilder();
        const versions: StoredVersion[] = [
            makeVersion({ id: "v1", label: "Before Eid sale", is_named: true }),
            makeVersion({ id: "v2", label: "Hero refresh", is_named: true }),
            makeVersion({ id: "v3", is_named: false }),
        ];
        render(
            <VersionHistoryScreen
                builder={builder}
                onClose={() => {}}
                initialVersions={versions}
            />,
        );
        expect(screen.getByTestId("version-history-row-v1")).toBeTruthy();
        expect(screen.getByTestId("version-history-row-v2")).toBeTruthy();
        expect(screen.getByTestId("version-history-row-v3")).toBeTruthy();
        expect(screen.getByText("Before Eid sale")).toBeTruthy();
        expect(screen.getByText("Hero refresh")).toBeTruthy();
        // Auto-save (null label) shows the fallback.
        expect(screen.getAllByText("Auto-save").length).toBeGreaterThan(0);
    });

    it("clicking a row selects it and shows the detail pane", () => {
        const builder = makeBuilder();
        const v = makeVersion({ id: "v-alpha", label: "Alpha", is_named: true });
        render(
            <VersionHistoryScreen
                builder={builder}
                onClose={() => {}}
                initialVersions={[v]}
            />,
        );
        fireEvent.click(screen.getByTestId("version-history-row-v-alpha"));
        const detail = screen.getByTestId("version-history-detail");
        expect(detail.textContent).toContain("Alpha");
        expect(screen.getByTestId("version-history-restore-button")).toBeTruthy();
    });

    it("opening the snapshot form, entering a label, and submitting calls createNamedSnapshot", async () => {
        const createNamedSnapshot = vi.fn().mockResolvedValue({
            id: "v-new",
            label: "My snapshot",
            created_at: new Date().toISOString(),
            created_by: "",
            author_name: "",
        });
        const builder = makeBuilder({ createNamedSnapshot });
        render(
            <VersionHistoryScreen
                builder={builder}
                onClose={() => {}}
                initialVersions={[]}
            />,
        );
        fireEvent.click(screen.getByTestId("version-history-new"));
        const input = screen.getByTestId(
            "version-history-snapshot-input",
        ) as HTMLInputElement;
        fireEvent.change(input, { target: { value: "My snapshot" } });
        fireEvent.click(screen.getByTestId("version-history-snapshot-submit"));
        await waitFor(() => {
            expect(createNamedSnapshot).toHaveBeenCalledWith("My snapshot");
        });
    });

    it("clicking Restore opens confirm dialog and confirming calls applyConfig", async () => {
        const applyConfig = vi.fn();
        const builder = makeBuilder({ applyConfig });
        const v = makeVersion({ id: "v-restore", label: "Snap A", is_named: true });
        render(
            <VersionHistoryScreen
                builder={builder}
                onClose={() => {}}
                initialVersions={[v]}
            />,
        );
        fireEvent.click(screen.getByTestId("version-history-row-v-restore"));
        fireEvent.click(screen.getByTestId("version-history-restore-button"));
        expect(screen.getByTestId("version-history-restore-dialog")).toBeTruthy();
        fireEvent.click(screen.getByTestId("version-history-restore-confirm"));
        await waitFor(() => {
            expect(applyConfig).toHaveBeenCalled();
        });
    });

    it("renders a diff when current draft differs from the selected version", () => {
        const builder = makeBuilder();
        // Mutate builder.config to differ from the version's config.
        builder.config.default_locale = "ar";
        const v = makeVersion({
            id: "v-diff",
            label: "Original",
            is_named: true,
            config: { ...emptyStoreConfigV2(), default_locale: "en" },
        });
        render(
            <VersionHistoryScreen
                builder={builder}
                onClose={() => {}}
                initialVersions={[v]}
            />,
        );
        fireEvent.click(screen.getByTestId("version-history-row-v-diff"));
        expect(screen.getByTestId("version-history-diff")).toBeTruthy();
        // There should be at least one "changed" row.
        expect(screen.getAllByTestId("version-history-diff-row-changed").length).toBeGreaterThan(0);
    });
});
