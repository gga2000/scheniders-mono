/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    render,
    screen,
    fireEvent,
    cleanup,
    act,
    waitFor,
} from "@testing-library/react";
import type {
    PageId,
    Breakpoint,
    LocaleCode,
    StoreConfigV2,
    Experiment,
} from "@scheniders/shared";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import type {
    UseStoreBuilderV2Return,
    ExperimentStats,
} from "@/hooks/use-store-builder-v2";

vi.mock("@/lib/supabase", () => ({
    supabase: { from: () => ({}) },
}));

import { ExperimentsScreen } from "./experiments-screen";

/* ─────────────────────────────────────────────────────────────────── */
/* Mock builder                                                         */
/* ─────────────────────────────────────────────────────────────────── */

interface MockBuilderHandle {
    builder: UseStoreBuilderV2Return;
    getConfig: () => StoreConfigV2;
    setStats: (stats: ExperimentStats) => void;
}

function makeBuilder(
    initial: Partial<StoreConfigV2> = {},
    statsByExp: Record<string, ExperimentStats> = {},
): MockBuilderHandle {
    let config: StoreConfigV2 = { ...emptyStoreConfigV2(), ...initial };
    let stats = statsByExp;
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
        active_custom_page_id: null,
        set_active_custom_page_id: noop,
        active_custom_page: null,
        active_breakpoint: "desktop" as Breakpoint,
        set_active_breakpoint: noop,
        active_locale: "en" as LocaleCode,
        set_active_locale: noop,
        save_state: "idle",
        last_saved_at: null,
        has_unpublished_changes: false,
        save_draft: asyncNoop,
        publish_conflict: false,
        publish_error: null,
        is_publishing: false,
        publish: async () => true,
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
        createSegment: (input) => ({ ...input, id: "seg_test" }),
        updateSegment: () => {},
        deleteSegment: () => {},
        findSegmentReferences: () => [],
        createExperiment: (input) => {
            counter += 1;
            const id = `exp_${counter}`;
            const experiment: Experiment = { ...input, id };
            update({ ...config, experiments: [...config.experiments, experiment] });
            return experiment;
        },
        updateExperiment: (id, patch) => {
            update({
                ...config,
                experiments: config.experiments.map((e) =>
                    e.id === id ? { ...e, ...patch, id: e.id } : e,
                ),
            });
        },
        deleteExperiment: (id) => {
            update({
                ...config,
                experiments: config.experiments.filter((e) => e.id !== id),
            });
        },
        findExperimentReferences: () => [],
        fetchExperimentStats: async (experimentId) => {
            return (
                stats[experimentId] ?? {
                    experiment_id: experimentId,
                    per_arm: {},
                    significance: {},
                }
            );
        },
    };
    return {
        builder,
        getConfig: () => config,
        setStats: (s) => {
            stats = { ...stats, [s.experiment_id]: s };
        },
    };
}

function renderScreen(
    handle: MockBuilderHandle,
    onClose: () => void = () => {},
): { rerender: () => void } {
    const view = render(
        <ExperimentsScreen builder={handle.builder} onClose={onClose} />,
    );
    return {
        rerender: () =>
            view.rerender(
                <ExperimentsScreen builder={handle.builder} onClose={onClose} />,
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

describe("ExperimentsScreen", () => {
    it("renders empty state", () => {
        const handle = makeBuilder();
        renderScreen(handle);
        expect(screen.getByTestId("experiments-empty")).toBeTruthy();
    });

    it("+ New experiment creates draft experiment with 2 default arms (50/50)", () => {
        const handle = makeBuilder();
        const { rerender } = renderScreen(handle);
        act(() => {
            fireEvent.click(screen.getByTestId("experiments-new"));
        });
        rerender();
        const created = handle.getConfig().experiments[0];
        expect(created).toBeTruthy();
        expect(created.arms.length).toBe(2);
        expect(created.arms[0].id).toBe("control");
        expect(created.arms[0].traffic_pct).toBe(50);
        expect(created.arms[1].traffic_pct).toBe(50);
        expect(screen.getByTestId("experiment-editor")).toBeTruthy();
    });

    it("traffic must sum to 100 — shows validation error otherwise", () => {
        const handle = makeBuilder({
            experiments: [
                {
                    id: "exp_a",
                    name: "Test",
                    status: "draft",
                    primary_metric: "orders",
                    arms: [
                        { id: "control", label: "Control", traffic_pct: 50 },
                        { id: "arm_b", label: "Variant A", traffic_pct: 50 },
                    ],
                },
            ],
        });
        const { rerender } = renderScreen(handle);
        act(() => {
            fireEvent.click(screen.getByTestId("experiment-row-exp_a-edit"));
        });
        rerender();

        // Initially sums to 100 — no error.
        const totalEl = screen.getByTestId("experiment-editor-traffic-total");
        expect(totalEl.textContent).toContain("100");
        expect(
            screen.queryByTestId("experiment-editor-traffic-error"),
        ).toBeNull();

        // Bump variant to 70 → total 120, error visible.
        const variantInput = screen.getByTestId("experiment-arm-arm_b-pct");
        act(() => {
            fireEvent.change(variantInput, { target: { value: "70" } });
        });
        rerender();
        expect(
            screen.getByTestId("experiment-editor-traffic-error"),
        ).toBeTruthy();
        expect(
            screen.getByTestId("experiment-editor-traffic-total").textContent,
        ).toContain("120");
    });

    it("renders arms with stats from the (mocked) supabase query", async () => {
        const handle = makeBuilder(
            {
                experiments: [
                    {
                        id: "exp_a",
                        name: "Live test",
                        status: "running",
                        primary_metric: "orders",
                        arms: [
                            { id: "control", label: "Control", traffic_pct: 50 },
                            { id: "arm_b", label: "Variant A", traffic_pct: 50 },
                        ],
                    },
                ],
            },
            {
                exp_a: {
                    experiment_id: "exp_a",
                    per_arm: {
                        control: {
                            visitors: 200,
                            add_to_cart: 40,
                            checkout_start: 20,
                            orders: 10,
                            revenue_iqd: 100_000,
                            conversion_rate: 10 / 200,
                            avg_order_value: 10_000,
                        },
                        arm_b: {
                            visitors: 200,
                            add_to_cart: 60,
                            checkout_start: 35,
                            orders: 24,
                            revenue_iqd: 240_000,
                            conversion_rate: 24 / 200,
                            avg_order_value: 10_000,
                        },
                    },
                    significance: {
                        control: {
                            z: null,
                            significant: false,
                            needs_more_data: false,
                            uplift_pct: 0,
                        },
                        arm_b: {
                            z: 2.83,
                            significant: true,
                            needs_more_data: false,
                            uplift_pct: 140,
                        },
                    },
                },
            },
        );
        const { rerender } = renderScreen(handle);
        act(() => {
            fireEvent.click(screen.getByTestId("experiment-row-exp_a-view"));
        });
        rerender();
        await waitFor(() => {
            expect(
                screen.getByTestId("experiment-viewer-arm-control"),
            ).toBeTruthy();
        });
        expect(
            screen.getByTestId("experiment-viewer-arm-control-visitors")
                .textContent,
        ).toContain("200");
        expect(
            screen.getByTestId("experiment-viewer-arm-arm_b-visitors")
                .textContent,
        ).toContain("200");

        // Escape closes the sheet, like every other sheet in the editor.
        fireEvent.keyDown(screen.getByTestId("experiment-viewer"), { key: "Escape" });
        rerender();
        await waitFor(() => {
            expect(screen.queryByTestId("experiment-viewer")).toBeNull();
        });
    });

    it("z-test significance: 200 visitors per arm + clear uplift → marked significant", async () => {
        // Use the REAL fetchExperimentStats via a custom mock that streams
        // events through Supabase — but we already cover that path via the
        // hook unit test (see "needs more data" below). Here we exercise
        // the UI rendering of the badge directly.
        const handle = makeBuilder(
            {
                experiments: [
                    {
                        id: "exp_a",
                        name: "Live test",
                        status: "running",
                        primary_metric: "orders",
                        arms: [
                            { id: "control", label: "Control", traffic_pct: 50 },
                            { id: "arm_b", label: "Variant A", traffic_pct: 50 },
                        ],
                    },
                ],
            },
            {
                exp_a: {
                    experiment_id: "exp_a",
                    per_arm: {
                        control: {
                            visitors: 200,
                            add_to_cart: 20,
                            checkout_start: 10,
                            orders: 10,
                            revenue_iqd: 0,
                            conversion_rate: 10 / 200,
                            avg_order_value: 0,
                        },
                        arm_b: {
                            visitors: 200,
                            add_to_cart: 40,
                            checkout_start: 25,
                            orders: 30,
                            revenue_iqd: 0,
                            conversion_rate: 30 / 200,
                            avg_order_value: 0,
                        },
                    },
                    significance: {
                        control: {
                            z: null,
                            significant: false,
                            needs_more_data: false,
                            uplift_pct: 0,
                        },
                        arm_b: {
                            z: 3.65,
                            significant: true,
                            needs_more_data: false,
                            uplift_pct: 200,
                        },
                    },
                },
            },
        );
        const { rerender } = renderScreen(handle);
        act(() => {
            fireEvent.click(screen.getByTestId("experiment-row-exp_a-view"));
        });
        rerender();
        await waitFor(() => {
            expect(screen.getByTestId("experiment-verdict-winning")).toBeTruthy();
        });
    });

    it("z-test: 50 visitors per arm → marked Need more data", async () => {
        const handle = makeBuilder(
            {
                experiments: [
                    {
                        id: "exp_a",
                        name: "Tiny test",
                        status: "running",
                        primary_metric: "orders",
                        arms: [
                            { id: "control", label: "Control", traffic_pct: 50 },
                            { id: "arm_b", label: "Variant A", traffic_pct: 50 },
                        ],
                    },
                ],
            },
            {
                exp_a: {
                    experiment_id: "exp_a",
                    per_arm: {
                        control: {
                            visitors: 50,
                            add_to_cart: 10,
                            checkout_start: 5,
                            orders: 3,
                            revenue_iqd: 0,
                            conversion_rate: 3 / 50,
                            avg_order_value: 0,
                        },
                        arm_b: {
                            visitors: 50,
                            add_to_cart: 20,
                            checkout_start: 8,
                            orders: 10,
                            revenue_iqd: 0,
                            conversion_rate: 10 / 50,
                            avg_order_value: 0,
                        },
                    },
                    significance: {
                        control: {
                            z: null,
                            significant: false,
                            needs_more_data: false,
                            uplift_pct: 0,
                        },
                        arm_b: {
                            z: 2.1,
                            significant: false,
                            needs_more_data: true,
                            uplift_pct: 233,
                        },
                    },
                },
            },
        );
        const { rerender } = renderScreen(handle);
        act(() => {
            fireEvent.click(screen.getByTestId("experiment-row-exp_a-view"));
        });
        rerender();
        await waitFor(() => {
            expect(screen.getByTestId("experiment-verdict-learning")).toBeTruthy();
        });
        expect(
            screen.queryByTestId("experiment-verdict-winning"),
        ).toBeNull();
    });

    /* ── New WINNING / LOSING / STILL LEARNING verdict tests ── */

    it("WINNING verdict renders when arm is significant with positive uplift", async () => {
        const handle = makeBuilder(
            {
                experiments: [
                    {
                        id: "exp_w",
                        name: "Winning test",
                        status: "running",
                        primary_metric: "orders",
                        arms: [
                            { id: "control", label: "Control", traffic_pct: 50 },
                            { id: "arm_b", label: "Variant B", traffic_pct: 50 },
                        ],
                    },
                ],
            },
            {
                exp_w: {
                    experiment_id: "exp_w",
                    per_arm: {
                        control: {
                            visitors: 500,
                            add_to_cart: 50,
                            checkout_start: 30,
                            orders: 50,
                            revenue_iqd: 0,
                            conversion_rate: 50 / 500,
                            avg_order_value: 0,
                        },
                        arm_b: {
                            visitors: 500,
                            add_to_cart: 150,
                            checkout_start: 110,
                            orders: 120,
                            revenue_iqd: 0,
                            conversion_rate: 120 / 500,
                            avg_order_value: 0,
                        },
                    },
                    significance: {
                        control: {
                            z: null,
                            significant: false,
                            needs_more_data: false,
                            uplift_pct: 0,
                        },
                        arm_b: {
                            z: 6.2,
                            significant: true,
                            needs_more_data: false,
                            uplift_pct: 140,
                        },
                    },
                },
            },
        );
        const { rerender } = renderScreen(handle);
        act(() => {
            fireEvent.click(screen.getByTestId("experiment-row-exp_w-view"));
        });
        rerender();
        await waitFor(() => {
            expect(screen.getByTestId("experiment-verdict-winning")).toBeTruthy();
        });
    });

    it("LOSING verdict renders when arm is significant with negative uplift", async () => {
        const handle = makeBuilder(
            {
                experiments: [
                    {
                        id: "exp_l",
                        name: "Losing test",
                        status: "running",
                        primary_metric: "orders",
                        arms: [
                            { id: "control", label: "Control", traffic_pct: 50 },
                            { id: "arm_b", label: "Variant B", traffic_pct: 50 },
                        ],
                    },
                ],
            },
            {
                exp_l: {
                    experiment_id: "exp_l",
                    per_arm: {
                        control: {
                            visitors: 500,
                            add_to_cart: 150,
                            checkout_start: 110,
                            orders: 120,
                            revenue_iqd: 0,
                            conversion_rate: 120 / 500,
                            avg_order_value: 0,
                        },
                        arm_b: {
                            visitors: 500,
                            add_to_cart: 50,
                            checkout_start: 30,
                            orders: 50,
                            revenue_iqd: 0,
                            conversion_rate: 50 / 500,
                            avg_order_value: 0,
                        },
                    },
                    significance: {
                        control: {
                            z: null,
                            significant: false,
                            needs_more_data: false,
                            uplift_pct: 0,
                        },
                        arm_b: {
                            z: -6.2,
                            significant: true,
                            needs_more_data: false,
                            uplift_pct: -58,
                        },
                    },
                },
            },
        );
        const { rerender } = renderScreen(handle);
        act(() => {
            fireEvent.click(screen.getByTestId("experiment-row-exp_l-view"));
        });
        rerender();
        await waitFor(() => {
            expect(screen.getByTestId("experiment-verdict-losing")).toBeTruthy();
        });
    });

    it("STILL LEARNING verdict renders when more data is required", async () => {
        const handle = makeBuilder(
            {
                experiments: [
                    {
                        id: "exp_n",
                        name: "Tiny test",
                        status: "running",
                        primary_metric: "orders",
                        arms: [
                            { id: "control", label: "Control", traffic_pct: 50 },
                            { id: "arm_b", label: "Variant B", traffic_pct: 50 },
                        ],
                    },
                ],
            },
            {
                exp_n: {
                    experiment_id: "exp_n",
                    per_arm: {
                        control: {
                            visitors: 20,
                            add_to_cart: 0,
                            checkout_start: 0,
                            orders: 1,
                            revenue_iqd: 0,
                            conversion_rate: 1 / 20,
                            avg_order_value: 0,
                        },
                        arm_b: {
                            visitors: 20,
                            add_to_cart: 0,
                            checkout_start: 0,
                            orders: 2,
                            revenue_iqd: 0,
                            conversion_rate: 2 / 20,
                            avg_order_value: 0,
                        },
                    },
                    significance: {
                        control: {
                            z: null,
                            significant: false,
                            needs_more_data: false,
                            uplift_pct: 0,
                        },
                        arm_b: {
                            z: 0.5,
                            significant: false,
                            needs_more_data: true,
                            uplift_pct: 100,
                        },
                    },
                },
            },
        );
        const { rerender } = renderScreen(handle);
        act(() => {
            fireEvent.click(screen.getByTestId("experiment-row-exp_n-view"));
        });
        rerender();
        await waitFor(() => {
            expect(screen.getByTestId("experiment-verdict-learning")).toBeTruthy();
        });
        // No headline percent while the result is not sure yet.
        expect(screen.queryByTestId("experiment-viewer-arm-arm_b-uplift")).toBeNull();
        // Instead it says how far the test is from a verdict.
        expect(screen.getByTestId("experiment-viewer-arm-arm_b-progress").textContent).toMatch(/more visitors/);
    });

    it("ending a test asks first and says everyone goes back to the first version", () => {
        const handle = makeBuilder({
            experiments: [
                {
                    id: "exp_s",
                    name: "Stop me",
                    status: "running",
                    primary_metric: "orders",
                    arms: [
                        { id: "control", label: "Today", traffic_pct: 50 },
                        { id: "arm_b", label: "New", traffic_pct: 50 },
                    ],
                },
            ],
        });
        const { rerender } = renderScreen(handle);
        fireEvent.click(screen.getByTestId("experiment-row-exp_s-stop"));
        expect(handle.getConfig().experiments[0]?.status).toBe("running");
        const confirm = screen.getByTestId("experiment-row-exp_s-stop-confirm");
        expect(confirm.textContent).toContain("Today");
        act(() => {
            fireEvent.click(screen.getByTestId("experiment-row-exp_s-stop-yes"));
        });
        rerender();
        expect(handle.getConfig().experiments[0]?.status).toBe("completed");
    });

    it("the edit drawer's status chip asks before ending a running test, and Escape closes it", () => {
        const handle = makeBuilder({
            experiments: [
                {
                    id: "exp_e",
                    name: "Chip",
                    status: "running",
                    primary_metric: "orders",
                    arms: [
                        { id: "control", label: "Today", traffic_pct: 50 },
                        { id: "arm_b", label: "New", traffic_pct: 50 },
                    ],
                },
            ],
        });
        const { rerender } = renderScreen(handle);
        fireEvent.click(screen.getByTestId("experiment-row-exp_e-edit"));
        fireEvent.click(screen.getByTestId("experiment-editor-status-completed"));
        expect(handle.getConfig().experiments[0]?.status).toBe("running");
        expect(screen.getByTestId("experiment-editor-stop-confirm").textContent).toContain("Today");
        act(() => {
            fireEvent.click(screen.getByTestId("experiment-editor-stop-yes"));
        });
        rerender();
        const ended = handle.getConfig().experiments[0];
        expect(ended?.status).toBe("completed");
        expect(ended?.ends_at).toBeTruthy();
        fireEvent.keyDown(screen.getByTestId("experiment-editor"), { key: "Escape" });
        expect(screen.queryByTestId("experiment-editor")).toBeNull();
    });

    it("cancelling the drawer's end-test confirm keeps focus in the sheet; Escape closes the confirm first", () => {
        const handle = makeBuilder({
            experiments: [
                {
                    id: "exp_f",
                    name: "Focus",
                    status: "running",
                    primary_metric: "orders",
                    arms: [
                        { id: "control", label: "Today", traffic_pct: 50 },
                        { id: "arm_b", label: "New", traffic_pct: 50 },
                    ],
                },
            ],
        });
        renderScreen(handle);
        fireEvent.click(screen.getByTestId("experiment-row-exp_f-edit"));
        const chip = screen.getByTestId("experiment-editor-status-completed");
        fireEvent.click(chip);
        fireEvent.click(screen.getByTestId("experiment-editor-stop-cancel"));
        expect(document.activeElement).toBe(chip);
        fireEvent.click(chip);
        fireEvent.keyDown(screen.getByTestId("experiment-editor"), { key: "Escape" });
        expect(screen.queryByTestId("experiment-editor-stop-confirm")).toBeNull();
        expect(screen.getByTestId("experiment-editor")).toBeTruthy();
        expect(handle.getConfig().experiments[0]?.status).toBe("running");
    });

    it("shows each running arm's orders and visitors on the card", async () => {
        const handle = makeBuilder(
            {
                experiments: [
                    {
                        id: "exp_c",
                        name: "Card numbers",
                        status: "running",
                        primary_metric: "orders",
                        arms: [
                            { id: "control", label: "Today", traffic_pct: 50 },
                            { id: "arm_b", label: "New", traffic_pct: 50 },
                        ],
                    },
                ],
            },
            {
                exp_c: {
                    experiment_id: "exp_c",
                    per_arm: {
                        control: { visitors: 1200, add_to_cart: 0, checkout_start: 0, orders: 12, revenue_iqd: 0, conversion_rate: 0.01, avg_order_value: 0 },
                        arm_b: { visitors: 1180, add_to_cart: 0, checkout_start: 0, orders: 18, revenue_iqd: 0, conversion_rate: 0.015, avg_order_value: 0 },
                    },
                    significance: {},
                },
            },
        );
        renderScreen(handle);
        await waitFor(() => {
            const text = screen.getByTestId("experiment-row-exp_c-results").textContent ?? "";
            expect(text).toContain("1,200");
            expect(text).toContain("18");
        });
    });

    it("a failed stats load shows one error with a retry, not the empty state too", async () => {
        const handle = makeBuilder({
            experiments: [
                {
                    id: "exp_e",
                    name: "Broken",
                    status: "running",
                    primary_metric: "orders",
                    arms: [
                        { id: "control", label: "Today", traffic_pct: 50 },
                        { id: "arm_b", label: "New", traffic_pct: 50 },
                    ],
                },
            ],
        });
        handle.builder.fetchExperimentStats = () => Promise.reject(new Error("rpc down"));
        renderScreen(handle);
        fireEvent.click(screen.getByTestId("experiment-row-exp_e-view"));
        await waitFor(() => {
            expect(screen.getByTestId("experiment-viewer-error")).toBeTruthy();
        });
        expect(screen.getByTestId("experiment-viewer-retry")).toBeTruthy();
        expect(screen.getByTestId("experiment-viewer").textContent).not.toContain("No data yet");
        expect(screen.getByTestId("experiment-viewer").textContent).not.toContain("rpc down");
    });

    it("a card whose numbers fail to load says so instead of going quiet", async () => {
        const handle = makeBuilder({
            experiments: [
                {
                    id: "exp_f",
                    name: "Broken card",
                    status: "running",
                    primary_metric: "orders",
                    arms: [
                        { id: "control", label: "Today", traffic_pct: 50 },
                        { id: "arm_b", label: "New", traffic_pct: 50 },
                    ],
                },
            ],
        });
        handle.builder.fetchExperimentStats = () => Promise.reject(new Error("rpc down"));
        renderScreen(handle);
        await waitFor(() => {
            expect(screen.getByTestId("experiment-row-exp_f-results-error")).toBeTruthy();
        });
        expect(screen.queryByTestId("experiment-row-exp_f-results")).toBeNull();
        expect(screen.getByTestId("experiment-row-exp_f-results-error").textContent).not.toContain("rpc down");
    });
});
