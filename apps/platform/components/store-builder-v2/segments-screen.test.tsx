/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    render,
    screen,
    fireEvent,
    cleanup,
    act,
} from "@testing-library/react";
import type {
    PageId,
    Breakpoint,
    LocaleCode,
    StoreConfigV2,
    AudienceSegment,
    SegmentRule,
} from "@scheniders/shared";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import type {
    UseStoreBuilderV2Return,
    VariantReference,
} from "@/hooks/use-store-builder-v2";

vi.mock("@/lib/supabase", () => ({
    supabase: { from: () => ({}) },
}));

import { SegmentsScreen } from "./segments-screen";

/* ─────────────────────────────────────────────────────────────────── */
/* Mutable mock builder                                                 */
/* ─────────────────────────────────────────────────────────────────── */

interface MockBuilderHandle {
    builder: UseStoreBuilderV2Return;
    /** Most recent config snapshot (mutates as the screen calls setters). */
    getConfig: () => StoreConfigV2;
    /** Override variant references for `findSegmentReferences`. */
    setReferences: (refs: Record<string, VariantReference[]>) => void;
}

function makeBuilder(
    initial: Partial<StoreConfigV2> = {},
    references: Record<string, VariantReference[]> = {},
): MockBuilderHandle {
    let config: StoreConfigV2 = { ...emptyStoreConfigV2(), ...initial };
    let refMap = references;
    const update = (next: StoreConfigV2): void => {
        config = next;
    };
    const noop = () => {};
    const asyncNoop = async () => {};
    let counter = 0;
    const builder: UseStoreBuilderV2Return = {
        get config() {
            return config;
        },
        setConfig: (next) => {
            const computed =
                typeof next === "function"
                    ? (next as (p: StoreConfigV2) => StoreConfigV2)(config)
                    : next;
            update(computed);
        },
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
        recoverable_backup: null,
        restore_backup: noop,
        dismiss_backup: noop,
        createNamedSnapshot: async () => ({
            id: "v0",
            label: "noop",
            created_at: new Date().toISOString(),
            created_by: "",
            author_name: "",
        }),
        listVersions: async () => [],
        getVersionConfig: async () => null,
        restoreVersion: async () => {},
        listSchedules: async () => [],
        createSchedule: async (input) => ({
            id: "s0",
            label: input.label,
            starts_at_iso: input.starts_at_iso,
            ends_at_iso: input.ends_at_iso,
            timezone: input.timezone,
            targets: input.targets,
            status: "scheduled",
            created_at: new Date().toISOString(),
        }),
        updateSchedule: async () => {},
        cancelSchedule: async () => {},
        deleteSchedule: async () => {},
        createSegment: (input) => {
            counter += 1;
            const id = `seg_${counter}`;
            const segment: AudienceSegment = { ...input, id };
            update({ ...config, segments: [...config.segments, segment] });
            return segment;
        },
        updateSegment: (id, patch) => {
            update({
                ...config,
                segments: config.segments.map((s) =>
                    s.id === id ? { ...s, ...patch, id: s.id } : s,
                ),
            });
        },
        deleteSegment: (id) => {
            update({
                ...config,
                segments: config.segments.filter((s) => s.id !== id),
            });
        },
        findSegmentReferences: (id) => refMap[id] ?? [],
        createExperiment: (input) => ({ ...input, id: "exp_test" }),
        updateExperiment: () => {},
        deleteExperiment: () => {},
        findExperimentReferences: () => [],
        fetchExperimentStats: async (experimentId) => ({
            experiment_id: experimentId,
            per_arm: {},
            significance: {},
        }),
    };
    return {
        builder,
        getConfig: () => config,
        setReferences: (next) => {
            refMap = next;
        },
    };
}

/**
 * Live-binding helper: re-render with the current config snapshot so the
 * screen observes mutations from the mock builder.
 */
function renderScreen(
    handle: MockBuilderHandle,
    onClose: () => void = () => {},
): { rerender: () => void } {
    const view = render(
        <SegmentsScreen builder={handle.builder} onClose={onClose} />,
    );
    return {
        rerender: () =>
            view.rerender(
                <SegmentsScreen builder={handle.builder} onClose={onClose} />,
            ),
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

describe("SegmentsScreen", () => {
    it("renders empty state when no segments", () => {
        const handle = makeBuilder();
        renderScreen(handle);
        expect(screen.getByTestId("segments-empty")).toBeTruthy();
        expect(screen.queryByTestId("segments-list")).toBeNull();
    });

    it("+ New segment creates a draft segment and opens the editor", () => {
        const handle = makeBuilder();
        const { rerender } = renderScreen(handle);
        act(() => {
            fireEvent.click(screen.getByTestId("segments-new"));
        });
        rerender();
        expect(handle.getConfig().segments.length).toBe(1);
        expect(handle.getConfig().segments[0].name).toBe("New segment");
        expect(screen.getByTestId("segment-editor")).toBeTruthy();
    });

    it("adding a governorate rule and multi-selecting 3 governorates persists correct shape", () => {
        const handle = makeBuilder({
            segments: [
                {
                    id: "seg_1",
                    name: "Baghdad VIPs",
                    description: "",
                    rules: [],
                    combine: "all",
                },
            ],
        });
        const { rerender } = renderScreen(handle);

        act(() => {
            fireEvent.click(screen.getByTestId("segment-editor-add-rule"));
        });
        rerender();
        act(() => {
            fireEvent.click(
                screen.getByTestId("segment-editor-add-rule-governorate"),
            );
        });
        rerender();

        for (const code of ["BG", "BA", "ER"]) {
            act(() => {
                fireEvent.click(screen.getByTestId(`segment-rule-0-gov-${code}`));
            });
            rerender();
        }

        const seg = handle.getConfig().segments[0];
        expect(seg.rules.length).toBe(1);
        const rule = seg.rules[0] as Extract<SegmentRule, { kind: "governorate" }>;
        expect(rule.kind).toBe("governorate");
        expect(new Set(rule.values)).toEqual(new Set(["BG", "BA", "ER"]));
    });

    it("deleting a segment that is referenced by variants shows a warning", () => {
        const handle = makeBuilder(
            {
                segments: [
                    {
                        id: "seg_x",
                        name: "Referenced",
                        description: "",
                        rules: [],
                        combine: "all",
                    },
                ],
            },
            {
                seg_x: [
                    { page_id: "home", section_id: "sec_a", variant_id: "var_a" },
                    { page_id: "home", section_id: "sec_b", variant_id: "var_b" },
                ],
            },
        );
        const { rerender } = renderScreen(handle);
        act(() => {
            fireEvent.click(screen.getByTestId("segment-editor-delete"));
        });
        rerender();
        expect(screen.getByTestId("segment-delete-confirm")).toBeTruthy();
        expect(screen.getByTestId("segment-delete-refs-warning")).toBeTruthy();
        expect(
            screen.getByTestId("segment-delete-refs-count").textContent,
        ).toBe("2");

        // First click acknowledges; second click confirms.
        act(() => {
            fireEvent.click(screen.getByTestId("segment-delete-confirm-btn"));
        });
        rerender();
        // Segment still present after acknowledgment-only click.
        expect(handle.getConfig().segments.length).toBe(1);
        act(() => {
            fireEvent.click(screen.getByTestId("segment-delete-confirm-btn"));
        });
        rerender();
        expect(handle.getConfig().segments.length).toBe(0);
    });

    it("switching combine ALL <-> ANY updates the segment", () => {
        const handle = makeBuilder({
            segments: [
                {
                    id: "seg_1",
                    name: "S",
                    description: "",
                    rules: [],
                    combine: "all",
                },
            ],
        });
        const { rerender } = renderScreen(handle);
        act(() => {
            fireEvent.click(screen.getByTestId("segment-editor-combine-any"));
        });
        rerender();
        expect(handle.getConfig().segments[0].combine).toBe("any");
        act(() => {
            fireEvent.click(screen.getByTestId("segment-editor-combine-all"));
        });
        rerender();
        expect(handle.getConfig().segments[0].combine).toBe("all");
    });
});
