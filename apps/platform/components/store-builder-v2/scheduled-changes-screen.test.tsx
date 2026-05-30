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
import type {
    PageId,
    Breakpoint,
    LocaleCode,
    StoreConfigV2,
} from "@scheniders/shared";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import type {
    UseStoreBuilderV2Return,
    StoredSchedule,
} from "@/hooks/use-store-builder-v2";

vi.mock("@/lib/supabase", () => ({
    supabase: {
        from: () => ({
            select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
        }),
    },
}));

import { ScheduledChangesScreen } from "./scheduled-changes-screen";

/* ─────────────────────────────────────────────────────────────────── */
/* Mock builder                                                         */
/* ─────────────────────────────────────────────────────────────────── */

function makeBuilder(
    overrides: Partial<UseStoreBuilderV2Return> = {},
): UseStoreBuilderV2Return {
    const config: StoreConfigV2 = emptyStoreConfigV2();
    // Seed a page + section + variant so the creator's cascade has data.
    config.pages = [
        {
            page_id: "home",
            sections: [
                {
                    id: "sec-1",
                    type: "hero_image",
                    enabled: true,
                    base: {},
                    label: "Hero",
                    variants: [
                        {
                            id: "var-1",
                            label: "Black Friday",
                            conditions: [],
                            override: {},
                            priority: 100,
                            enabled: true,
                        },
                    ],
                },
            ],
        },
    ];

    const noop = () => {};
    const asyncNoop = async () => {};
    return {
        config,
        setConfig: noop,
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
        createNamedSnapshot: async () => ({
            id: "v0",
            label: "noop",
            created_at: new Date().toISOString(),
            created_by: "",
            author_name: "",
        }),
        listVersions: async () => [],
        restoreVersion: async () => {},
        listSchedules: async () => [],
        createSchedule: async (input) => ({
            id: "s-new",
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

function makeSchedule(overrides: Partial<StoredSchedule> = {}): StoredSchedule {
    return {
        id: overrides.id ?? `s-${Math.random().toString(36).slice(2, 8)}`,
        label: overrides.label ?? "Promo",
        starts_at_iso: overrides.starts_at_iso ?? new Date().toISOString(),
        ends_at_iso: overrides.ends_at_iso,
        timezone: overrides.timezone ?? "Asia/Baghdad",
        targets: overrides.targets ?? [],
        status: overrides.status ?? "scheduled",
        created_at: overrides.created_at ?? new Date().toISOString(),
    };
}

const NOW = new Date("2026-05-15T12:00:00Z");

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

/* ─────────────────────────────────────────────────────────────────── */
/* Tests                                                                */
/* ─────────────────────────────────────────────────────────────────── */

describe("ScheduledChangesScreen", () => {
    it("renders schedules grouped by Active / Upcoming / Expired", () => {
        const builder = makeBuilder();
        const schedules: StoredSchedule[] = [
            // Active — started in the past, ends in the future.
            makeSchedule({
                id: "s-active",
                label: "Black Friday hero swap",
                starts_at_iso: new Date(NOW.getTime() - 60 * 60 * 1000).toISOString(),
                ends_at_iso: new Date(NOW.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            }),
            // Upcoming.
            makeSchedule({
                id: "s-upcoming",
                label: "Eid promo",
                starts_at_iso: new Date(NOW.getTime() + 12 * 24 * 60 * 60 * 1000).toISOString(),
                ends_at_iso: new Date(NOW.getTime() + 17 * 24 * 60 * 60 * 1000).toISOString(),
            }),
            // Expired.
            makeSchedule({
                id: "s-expired",
                label: "Old promo",
                starts_at_iso: new Date(NOW.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
                ends_at_iso: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            }),
        ];
        render(
            <ScheduledChangesScreen
                builder={builder}
                onClose={() => {}}
                initialSchedules={schedules}
                nowOverride={NOW}
            />,
        );
        expect(screen.getByTestId("bucket-active")).toBeTruthy();
        expect(screen.getByTestId("bucket-upcoming")).toBeTruthy();
        expect(screen.getByTestId("bucket-expired")).toBeTruthy();
        expect(screen.getByTestId("schedule-row-s-active")).toBeTruthy();
        expect(screen.getByTestId("schedule-row-s-upcoming")).toBeTruthy();
        // Expired bucket is collapsed by default.
        expect(screen.queryByTestId("schedule-row-s-expired")).toBeNull();
        // Expand it.
        fireEvent.click(screen.getByTestId("bucket-expired-toggle"));
        expect(screen.getByTestId("schedule-row-s-expired")).toBeTruthy();
    });

    it("clicking + New schedule opens the modal", () => {
        const builder = makeBuilder();
        render(
            <ScheduledChangesScreen
                builder={builder}
                onClose={() => {}}
                initialSchedules={[]}
                nowOverride={NOW}
            />,
        );
        fireEvent.click(screen.getByTestId("scheduled-changes-new"));
        expect(screen.getByTestId("schedule-creator-modal")).toBeTruthy();
    });

    it("filling the creator cascading selects and submitting calls createSchedule", async () => {
        const createSchedule = vi.fn().mockResolvedValue({
            id: "s-new",
            label: "Promo",
            starts_at_iso: new Date(NOW.getTime() + 86_400_000).toISOString(),
            timezone: "Asia/Baghdad",
            targets: [{ page_id: "home", section_id: "sec-1", variant_id: "var-1" }],
            status: "scheduled",
            created_at: NOW.toISOString(),
        });
        const builder = makeBuilder({ createSchedule });
        render(
            <ScheduledChangesScreen
                builder={builder}
                onClose={() => {}}
                initialSchedules={[]}
                nowOverride={NOW}
            />,
        );
        fireEvent.click(screen.getByTestId("scheduled-changes-new"));

        fireEvent.change(
            screen.getByTestId("schedule-creator-label") as HTMLInputElement,
            { target: { value: "My new promo" } },
        );
        // Use a future local datetime — datetime-local strings are parsed by Date().
        fireEvent.change(
            screen.getByTestId("schedule-creator-start") as HTMLInputElement,
            { target: { value: "2030-01-01T10:00" } },
        );
        fireEvent.change(
            screen.getByTestId("schedule-creator-page") as HTMLSelectElement,
            { target: { value: "home" } },
        );
        fireEvent.change(
            screen.getByTestId("schedule-creator-section") as HTMLSelectElement,
            { target: { value: "sec-1" } },
        );
        fireEvent.change(
            screen.getByTestId("schedule-creator-variant") as HTMLSelectElement,
            { target: { value: "var-1" } },
        );
        fireEvent.click(screen.getByTestId("schedule-creator-submit"));

        await waitFor(() => {
            expect(createSchedule).toHaveBeenCalledTimes(1);
        });
        const arg = createSchedule.mock.calls[0][0];
        expect(arg.label).toBe("My new promo");
        expect(arg.targets[0]).toMatchObject({
            page_id: "home",
            section_id: "sec-1",
            variant_id: "var-1",
        });
    });

    it("clicking End early on an active schedule sets ends_at to ~now via updateSchedule", async () => {
        const updateSchedule = vi.fn().mockResolvedValue(undefined);
        const builder = makeBuilder({ updateSchedule });
        const s = makeSchedule({
            id: "s-end",
            label: "Live now",
            starts_at_iso: new Date(NOW.getTime() - 3_600_000).toISOString(),
            ends_at_iso: new Date(NOW.getTime() + 86_400_000).toISOString(),
        });
        render(
            <ScheduledChangesScreen
                builder={builder}
                onClose={() => {}}
                initialSchedules={[s]}
                nowOverride={NOW}
            />,
        );
        fireEvent.click(screen.getByTestId("schedule-row-s-end-end-early"));
        await waitFor(() => {
            expect(updateSchedule).toHaveBeenCalledTimes(1);
        });
        const [id, patch] = updateSchedule.mock.calls[0];
        expect(id).toBe("s-end");
        expect(patch.status).toBe("expired");
        expect(typeof patch.ends_at_iso).toBe("string");
    });

    it("clicking Cancel on an upcoming schedule calls cancelSchedule", async () => {
        const cancelSchedule = vi.fn().mockResolvedValue(undefined);
        const builder = makeBuilder({ cancelSchedule });
        const s = makeSchedule({
            id: "s-up",
            label: "Coming up",
            starts_at_iso: new Date(NOW.getTime() + 86_400_000).toISOString(),
        });
        render(
            <ScheduledChangesScreen
                builder={builder}
                onClose={() => {}}
                initialSchedules={[s]}
                nowOverride={NOW}
            />,
        );
        fireEvent.click(screen.getByTestId("schedule-row-s-up-cancel"));
        await waitFor(() => {
            expect(cancelSchedule).toHaveBeenCalledWith("s-up");
        });
    });

    it("selecting + Create new variant in the creator inserts a variant and references it in the schedule", async () => {
        const setConfig = vi.fn();
        const createSchedule = vi.fn().mockImplementation(async (input) => ({
            id: "s-new",
            ...input,
            status: "scheduled",
            created_at: NOW.toISOString(),
        }));
        const builder = makeBuilder({ setConfig, createSchedule });
        render(
            <ScheduledChangesScreen
                builder={builder}
                onClose={() => {}}
                initialSchedules={[]}
                nowOverride={NOW}
            />,
        );
        fireEvent.click(screen.getByTestId("scheduled-changes-new"));

        fireEvent.change(
            screen.getByTestId("schedule-creator-label") as HTMLInputElement,
            { target: { value: "Inline variant" } },
        );
        fireEvent.change(
            screen.getByTestId("schedule-creator-start") as HTMLInputElement,
            { target: { value: "2030-01-01T10:00" } },
        );
        fireEvent.change(
            screen.getByTestId("schedule-creator-page") as HTMLSelectElement,
            { target: { value: "home" } },
        );
        fireEvent.change(
            screen.getByTestId("schedule-creator-section") as HTMLSelectElement,
            { target: { value: "sec-1" } },
        );
        fireEvent.change(
            screen.getByTestId("schedule-creator-variant") as HTMLSelectElement,
            { target: { value: "__create_new__" } },
        );
        fireEvent.change(
            screen.getByTestId(
                "schedule-creator-new-variant-label",
            ) as HTMLInputElement,
            { target: { value: "Inline V1" } },
        );
        fireEvent.click(screen.getByTestId("schedule-creator-submit"));

        await waitFor(() => {
            expect(createSchedule).toHaveBeenCalledTimes(1);
        });
        // setConfig must have been called to add the new variant.
        expect(setConfig).toHaveBeenCalled();
        const arg = createSchedule.mock.calls[0][0];
        expect(arg.targets[0].section_id).toBe("sec-1");
        // The variant id should differ from "var-1" (existing) because a fresh
        // one was generated.
        expect(arg.targets[0].variant_id).not.toBe("var-1");
    });
});
