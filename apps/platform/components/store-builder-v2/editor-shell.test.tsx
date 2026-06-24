/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import type { PageId, Breakpoint, LocaleCode, StoreConfigV2 } from "@scheniders/shared";
import { emptyStoreConfigV2 } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";

// The hook touches the live supabase client at import time, which in turn
// reads NEXT_PUBLIC_SUPABASE_URL via the env loader. Stub the supabase
// module so we never reach env validation in the test environment.
vi.mock("@/lib/supabase", () => ({
    supabase: {
        from: () => ({
            update: () => ({ eq: () => Promise.resolve({ error: null }) }),
            select: () => ({
                eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }),
            }),
        }),
    },
}));

// The storefront URL hook reaches react-query + supabase; stub it to a fixed value.
vi.mock("@/hooks/use-storefront-url", () => ({
    useStorefrontUrl: () => "http://localhost:3001/s/test-store",
}));

/* ─────────────────────────────────────────────────────────────────── */
/* Bridge mock — capture postMessage calls without a real iframe       */
/* ─────────────────────────────────────────────────────────────────── */

// Shared spies the tests can read directly. The mock factory must not
// reference these via closure (vitest hoists `vi.mock`), so we attach
// them to globalThis and resolve at call time inside the factory.
interface MockBridgeSpies {
    state: { ready: boolean; inline_editing?: boolean };
    postPageConfigUpdate: ReturnType<typeof vi.fn>;
    postRuntimeUpdate: ReturnType<typeof vi.fn>;
    postPageIdChange: ReturnType<typeof vi.fn>;
    scrollToSection: ReturnType<typeof vi.fn>;
    requestRect: ReturnType<typeof vi.fn>;
    ping: ReturnType<typeof vi.fn>;
    onSectionClicked: ReturnType<typeof vi.fn>;
    setSelectedSection: ReturnType<typeof vi.fn>;
    onInlineEditCommit: ReturnType<typeof vi.fn>;
    requestAllRects: ReturnType<typeof vi.fn>;
    onContextMenu: ReturnType<typeof vi.fn>;
}

declare global {
    // eslint-disable-next-line no-var
    var __editorShellBridge: MockBridgeSpies | undefined;
}

vi.mock("@/hooks/use-iframe-bridge", () => ({
    useIframeBridge: () => {
        const g = globalThis as { __editorShellBridge?: MockBridgeSpies };
        if (!g.__editorShellBridge) {
            g.__editorShellBridge = {
                state: { ready: false, inline_editing: false },
                postPageConfigUpdate: vi.fn(),
                postRuntimeUpdate: vi.fn(),
                postPageIdChange: vi.fn(),
                scrollToSection: vi.fn(),
                requestRect: vi.fn(),
                ping: vi.fn().mockResolvedValue(undefined),
                onSectionClicked: vi.fn(() => () => {}),
                setSelectedSection: vi.fn(),
                onInlineEditCommit: vi.fn(() => () => {}),
                requestAllRects: vi.fn(),
                onContextMenu: vi.fn(() => () => {}),
            };
        }
        // Editor reads `bridge.state.ready` + the post methods.
        return {
            state: {
                ...g.__editorShellBridge.state,
                inline_editing: g.__editorShellBridge.state.inline_editing ?? false,
                scroll_y: 0,
                hovered_section_id: null,
                hovered_rect: null,
                rect_updates: {},
                all_rects: [],
            },
            scrollToSection: g.__editorShellBridge.scrollToSection,
            requestRect: g.__editorShellBridge.requestRect,
            ping: g.__editorShellBridge.ping,
            onSectionClicked: g.__editorShellBridge.onSectionClicked,
            setSelectedSection: g.__editorShellBridge.setSelectedSection,
            onInlineEditCommit: g.__editorShellBridge.onInlineEditCommit,
            requestAllRects: g.__editorShellBridge.requestAllRects,
            onContextMenu: g.__editorShellBridge.onContextMenu,
            postPageConfigUpdate: g.__editorShellBridge.postPageConfigUpdate,
            postRuntimeUpdate: g.__editorShellBridge.postRuntimeUpdate,
            postPageIdChange: g.__editorShellBridge.postPageIdChange,
        };
    },
}));

function getBridgeSpies(): MockBridgeSpies {
    const g = globalThis as { __editorShellBridge?: MockBridgeSpies };
    if (!g.__editorShellBridge) {
        throw new Error("bridge mock not initialized — render the shell first");
    }
    return g.__editorShellBridge;
}

import { EditorShell } from "./editor-shell";

/* ─────────────────────────────────────────────────────────────────── */
/* Mock builder factory                                                 */
/* ─────────────────────────────────────────────────────────────────── */

function makeBuilder(overrides: Partial<UseStoreBuilderV2Return> = {}): UseStoreBuilderV2Return {
    const config: StoreConfigV2 = emptyStoreConfigV2();
    const noop = () => {};
    const asyncNoop = async () => {};
    const state: UseStoreBuilderV2Return = {
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
        publish_conflict: false,
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
    return state;
}

const TENANT = {
    id: "tenant-123",
    slug: "test-store",
    business_name: "Test Store",
};

beforeEach(() => {
    // Reset the global bridge spy bag so each test starts clean.
    (globalThis as { __editorShellBridge?: unknown }).__editorShellBridge = undefined;
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

/* ─────────────────────────────────────────────────────────────────── */
/* Tests                                                                */
/* ─────────────────────────────────────────────────────────────────── */

describe("EditorShell", () => {
    it("renders the page tree", () => {
        const builder = makeBuilder();
        render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
            />,
        );
        expect(screen.getByTestId("page-tree")).toBeTruthy();
        expect(screen.getByTestId("page-tree-item-home")).toBeTruthy();
        expect(screen.getByTestId("page-tree-item-cart")).toBeTruthy();
    });

    it("calls set_active_page when a tree item is clicked", () => {
        const setActivePage = vi.fn();
        const builder = makeBuilder({ set_active_page: setActivePage });
        render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
            />,
        );
        fireEvent.click(screen.getByTestId("page-tree-item-cart"));
        expect(setActivePage).toHaveBeenCalledWith("cart");
    });

    it("sizes the preview iframe to mobile width (390px) when active_breakpoint is mobile", () => {
        const builder = makeBuilder({ active_breakpoint: "mobile" });
        render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
                initialSystemScreen={null}
            />,
        );
        // BUG1: the in-canvas preview is now a cross-origin iframe whose
        // wrapper carries the device width, giving the page its OWN layout
        // viewport so media queries reflow. (LivePreview's width-only <div>
        // did not.) Assert the wrapper width tracks the active breakpoint.
        const viewport = screen.getByTestId(
            "preview-frame-viewport",
        ) as HTMLDivElement;
        expect(viewport.style.width).toBe("390px");
    });

    it("disables Publish when there are no unpublished changes", () => {
        const onPublish = vi.fn().mockResolvedValue(undefined);
        const builder = makeBuilder({
            has_unpublished_changes: false,
            publish: onPublish,
        });
        render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
            />,
        );
        const btn = screen.getByTestId("publish-button") as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        fireEvent.click(btn);
        expect(onPublish).not.toHaveBeenCalled();
    });

    it("enables Publish when there are unpublished changes (and no blocking health checks)", () => {
        // Build a config without `blocks_publish` failures so the
        // launch-checklist gate doesn't disable Publish.
        const cfg = emptyStoreConfigV2();
        cfg.brand_kit.identity = {
            ...cfg.brand_kit.identity,
            name: "Test",
            og_image_url: "https://x/og.jpg",
        };
        cfg.globals.analytics_pixels = {
            id: "pix",
            type: "analytics_pixels",
            enabled: true,
            base: { meta_pixel_id: "123" },
        };
        for (const id of ["policy_privacy", "policy_shipping", "policy_returns", "policy_terms"] as const) {
            const p = cfg.pages.find((p) => p.page_id === id);
            if (p) p.sections = [{ id: `${id}-1`, type: "about_block", enabled: true, base: { body: "x" } }];
        }
        // Also give Home content + meta to ensure failure check `home_meta_title` passes
        // (not strictly needed since it's not blocking, but keeps the score sensible).
        const home = cfg.pages.find((p) => p.page_id === "home");
        if (home) {
            home.sections = [{ id: "h1", type: "hero_image", enabled: true, base: { title: "x", image_url: "https://x" } }];
            home.meta = { title: { en: "Home" }, description: { en: "Home desc" } };
        }

        const builder = makeBuilder({ has_unpublished_changes: true, config: cfg });
        render(
            <EditorShell
                tenant={TENANT}
                initialConfig={cfg}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
                initialSystemScreen={null}
            />,
        );
        const btn = screen.getByTestId("publish-button") as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
    });

    it("does NOT disable Publish when health has blocking failures (sheet surfaces them instead)", () => {
        // Empty config has multiple `blocks_publish` ad_compliance failures.
        // Builder v2 no longer blocks publish on health — clicking Publish
        // opens the PublishConfirmSheet so the merchant can fix or
        // publish anyway. The button should be enabled and the tooltip is a
        // non-blocking advisory that matches the enabled button (BUG41).
        const onPublish = vi.fn().mockResolvedValue(undefined);
        const builder = makeBuilder({
            has_unpublished_changes: true,
            publish: onPublish,
        });
        render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
                initialSystemScreen={null}
            />,
        );
        const btn = screen.getByTestId("publish-button") as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
        expect(btn.getAttribute("title") ?? "").toMatch(/will be shown before you publish/);
        // Click does NOT publish directly — the sheet should open.
        fireEvent.click(btn);
        expect(onPublish).not.toHaveBeenCalled();
        expect(screen.getByTestId("publish-confirm-sheet")).toBeTruthy();
    });

    /* ── Live preview postMessage plumbing ──────────────────────── */

    it("posts page_config_update + runtime_update once the bridge is ready", async () => {
        // Pre-seed the bridge as ready so the effect fires on first mount.
        (globalThis as { __editorShellBridge?: MockBridgeSpies }).__editorShellBridge = {
            state: { ready: true, inline_editing: false },
            postPageConfigUpdate: vi.fn(),
            postRuntimeUpdate: vi.fn(),
            postPageIdChange: vi.fn(),
            scrollToSection: vi.fn(),
            requestRect: vi.fn(),
            ping: vi.fn().mockResolvedValue(undefined),
            onSectionClicked: vi.fn(() => () => {}),
            setSelectedSection: vi.fn(),
            onInlineEditCommit: vi.fn(() => () => {}),
            requestAllRects: vi.fn(),
            onContextMenu: vi.fn(() => () => {}),
        };

        const builder = makeBuilder();
        render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
            />,
        );

        // Effect is debounced ~100ms; wait it out.
        await act(async () => {
            await new Promise((r) => setTimeout(r, 200));
        });

        const spies = getBridgeSpies();
        expect(spies.postPageConfigUpdate).toHaveBeenCalled();
        expect(spies.postRuntimeUpdate).toHaveBeenCalled();

        const runtime = spies.postRuntimeUpdate.mock.calls[0][0];
        expect(runtime.page_id).toBe("home");
        expect(runtime.breakpoint).toBe("desktop");
        expect(runtime.locale).toBe("en");
    });

    it("does not post live-render updates when the bridge is not ready", async () => {
        // Default mock state.ready === false.
        const builder = makeBuilder();
        render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
            />,
        );

        await act(async () => {
            await new Promise((r) => setTimeout(r, 200));
        });

        const spies = getBridgeSpies();
        expect(spies.postPageConfigUpdate).not.toHaveBeenCalled();
        expect(spies.postRuntimeUpdate).not.toHaveBeenCalled();
    });

    it("posts a runtime_update with the new breakpoint when active_breakpoint changes", async () => {
        (globalThis as { __editorShellBridge?: MockBridgeSpies }).__editorShellBridge = {
            state: { ready: true, inline_editing: false },
            postPageConfigUpdate: vi.fn(),
            postRuntimeUpdate: vi.fn(),
            postPageIdChange: vi.fn(),
            scrollToSection: vi.fn(),
            requestRect: vi.fn(),
            ping: vi.fn().mockResolvedValue(undefined),
            onSectionClicked: vi.fn(() => () => {}),
            setSelectedSection: vi.fn(),
            onInlineEditCommit: vi.fn(() => () => {}),
            requestAllRects: vi.fn(),
            onContextMenu: vi.fn(() => () => {}),
        };

        let currentBreakpoint: Breakpoint = "desktop";
        const setActiveBreakpoint = vi.fn((b: Breakpoint) => {
            currentBreakpoint = b;
        });
        const builder = makeBuilder({
            get active_breakpoint() {
                return currentBreakpoint;
            },
            set_active_breakpoint: setActiveBreakpoint,
        } as Partial<UseStoreBuilderV2Return>);

        const { rerender } = render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
            />,
        );

        await act(async () => {
            await new Promise((r) => setTimeout(r, 200));
        });

        const spies = getBridgeSpies();
        spies.postRuntimeUpdate.mockClear();
        spies.postPageConfigUpdate.mockClear();

        // Simulate breakpoint change.
        currentBreakpoint = "mobile";
        rerender(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={{
                    ...builder,
                    active_breakpoint: "mobile" as Breakpoint,
                }}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
            />,
        );

        await act(async () => {
            await new Promise((r) => setTimeout(r, 200));
        });

        expect(spies.postRuntimeUpdate).toHaveBeenCalled();
        const lastRuntime = spies.postRuntimeUpdate.mock.calls[
            spies.postRuntimeUpdate.mock.calls.length - 1
        ][0];
        expect(lastRuntime.breakpoint).toBe("mobile");
    });

    /* ── Undo/redo toolbar buttons ───────────────────────────────── */

    it("renders Undo + Redo buttons next to the breakpoint toggle", () => {
        const builder = makeBuilder();
        render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
            />,
        );
        expect(screen.getByTestId("undo-button")).toBeTruthy();
        expect(screen.getByTestId("redo-button")).toBeTruthy();
        const undoBtn = screen.getByTestId("undo-button") as HTMLButtonElement;
        const redoBtn = screen.getByTestId("redo-button") as HTMLButtonElement;
        expect(undoBtn.disabled).toBe(true);
        expect(redoBtn.disabled).toBe(true);
    });

    it("calls builder.undo()/redo() when the buttons are clicked", () => {
        const undo = vi.fn();
        const redo = vi.fn();
        const builder = makeBuilder({
            undo,
            redo,
            can_undo: true,
            can_redo: true,
            undo_description: "Deleted Hero section",
            redo_description: "Edited Hero title",
        });
        render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
            />,
        );
        fireEvent.click(screen.getByTestId("undo-button"));
        expect(undo).toHaveBeenCalled();
        fireEvent.click(screen.getByTestId("redo-button"));
        expect(redo).toHaveBeenCalled();
    });

    it("uses the stored history description in the undo/redo tooltips", () => {
        const builder = makeBuilder({
            can_undo: true,
            can_redo: true,
            undo_description: "Deleted Hero section",
            redo_description: "Edited Hero title",
        });
        render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
            />,
        );
        const undoBtn = screen.getByTestId("undo-button") as HTMLButtonElement;
        const redoBtn = screen.getByTestId("redo-button") as HTMLButtonElement;
        expect(undoBtn.getAttribute("title")).toBe(
            "Undo: Deleted Hero section",
        );
        expect(redoBtn.getAttribute("title")).toBe(
            "Redo: Edited Hero title",
        );
    });

    it("posts page_id_change when active_page changes after the bridge is ready", async () => {
        (globalThis as { __editorShellBridge?: MockBridgeSpies }).__editorShellBridge = {
            state: { ready: true, inline_editing: false },
            postPageConfigUpdate: vi.fn(),
            postRuntimeUpdate: vi.fn(),
            postPageIdChange: vi.fn(),
            scrollToSection: vi.fn(),
            requestRect: vi.fn(),
            ping: vi.fn().mockResolvedValue(undefined),
            onSectionClicked: vi.fn(() => () => {}),
            setSelectedSection: vi.fn(),
            onInlineEditCommit: vi.fn(() => () => {}),
            requestAllRects: vi.fn(),
            onContextMenu: vi.fn(() => () => {}),
        };

        const builder = makeBuilder();
        const { rerender } = render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
            />,
        );

        await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });

        const spies = getBridgeSpies();
        // First-mount: no page_id_change should fire (the iframe is
        // already on the initial page).
        expect(spies.postPageIdChange).not.toHaveBeenCalled();

        // Now switch the active page and re-render.
        rerender(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={{
                    ...builder,
                    active_page: "cart" as PageId,
                }}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
            />,
        );

        await act(async () => {
            await new Promise((r) => setTimeout(r, 50));
        });

        expect(spies.postPageIdChange).toHaveBeenCalledTimes(1);
        const url = spies.postPageIdChange.mock.calls[0][0];
        expect(url).toContain("/_preview/test-store");
        expect(url).toContain("page=cart");
    });

    /* ── Phase 2d: responsive layout switch ─────────────────────── */

    function setViewportWidth(px: number): void {
        Object.defineProperty(window, "innerWidth", {
            configurable: true,
            writable: true,
            value: px,
        });
        // Polyfill matchMedia for jsdom — useIsMobileEditor calls it.
        if (!window.matchMedia) {
            window.matchMedia = ((query: string) => {
                const m = /\(max-width:\s*(\d+)px\)/.exec(query);
                const limit = m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
                return {
                    media: query,
                    matches: window.innerWidth <= limit,
                    onchange: null,
                    addEventListener: () => {},
                    removeEventListener: () => {},
                    addListener: () => {},
                    removeListener: () => {},
                    dispatchEvent: () => true,
                } as MediaQueryList;
            }) as unknown as typeof window.matchMedia;
        }
        window.dispatchEvent(new Event("resize"));
    }

    it("renders the desktop 3-pane shell at ≥1024px (page-tree, canvas, inspector all present)", async () => {
        setViewportWidth(1440);
        const builder = makeBuilder();
        render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
                initialSystemScreen={null}
            />,
        );
        // Wait for the post-mount effect tick so the hook has reconciled
        // its initial false → false (or false → true) state.
        await act(async () => {
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(screen.getByTestId("page-tree")).toBeTruthy();
        expect(screen.getByTestId("inspector-rail")).toBeTruthy();
        // The desktop main is present, mobile shell is not.
        expect(screen.queryByTestId("mobile-editor-shell")).toBeNull();
        expect(screen.getByTestId("editor-shell-main")).toBeTruthy();
    });

    it("renders the mobile bottom-bar layout at ≤768px and hides the inspector by default", async () => {
        setViewportWidth(390);
        const builder = makeBuilder();
        render(
            <EditorShell
                tenant={TENANT}
                initialConfig={emptyStoreConfigV2()}
                hasPublished
                builderOverride={builder}
                storefrontUrlOverride="http://localhost:3001/s/test-store"
                initialSystemScreen={null}
            />,
        );
        await act(async () => {
            await new Promise((r) => setTimeout(r, 30));
        });
        expect(screen.getByTestId("mobile-editor-shell")).toBeTruthy();
        expect(screen.getByTestId("mobile-editor-bottombar")).toBeTruthy();
        expect(screen.getByTestId("mobile-editor-fab")).toBeTruthy();
        // Inspector rail must not be rendered until the merchant opens
        // the inspector drawer.
        expect(screen.queryByTestId("inspector-rail")).toBeNull();
        // Desktop main grid is not rendered.
        expect(screen.queryByTestId("editor-shell-main")).toBeNull();
    });
});
