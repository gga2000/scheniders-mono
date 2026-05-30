/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import {
    render,
    screen,
    fireEvent,
    cleanup,
    act,
} from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import type { StoreConfigV2 } from "@scheniders/shared";
import { emptyStoreConfigV2 } from "@scheniders/shared";

import { LivePreview, type LivePreviewTenant } from "./live-preview";

const TENANT: LivePreviewTenant = {
    id: "tenant-123",
    slug: "test-store",
    business_name: "Test Store",
};

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

beforeEach(() => {
    vi.useFakeTimers();
});

function makeConfigWithHero(): StoreConfigV2 {
    const cfg = emptyStoreConfigV2();
    const home = cfg.pages.find((p) => p.page_id === "home");
    if (home) {
        home.sections = [
            {
                id: "hero-1",
                type: "hero_image",
                enabled: true,
                base: {
                    title_i18n: { en: "Welcome!", ar: "أهلاً!" },
                    subtitle_i18n: { en: "Hello", ar: "مرحبا" },
                    cta_label_i18n: { en: "Shop", ar: "تسوّق" },
                    cta_href: "/products",
                },
            },
        ];
    }
    return cfg;
}

function makeConfigWithTwoHeroes(): StoreConfigV2 {
    const cfg = emptyStoreConfigV2();
    const home = cfg.pages.find((p) => p.page_id === "home");
    if (home) {
        const baseProps = {
            title_i18n: { en: "Welcome!", ar: "أهلاً!" },
            subtitle_i18n: { en: "Hello", ar: "مرحبا" },
            cta_label_i18n: { en: "Shop", ar: "تسوّق" },
            cta_href: "/products",
        };
        home.sections = [
            { id: "hero-1", type: "hero_image", enabled: true, base: baseProps },
            { id: "hero-2", type: "hero_image", enabled: true, base: baseProps },
        ];
    }
    return cfg;
}

function renderPreview(overrides: Partial<React.ComponentProps<typeof LivePreview>> = {}) {
    const onInlineEdit = vi.fn();
    const onSectionClick = vi.fn();
    const utils = render(
        <LivePreview
            config={makeConfigWithHero()}
            pageId="home"
            breakpoint="desktop"
            locale="en"
            tenant={TENANT}
            selectedSectionId="hero-1"
            selectedSectionLabel="Hero"
            onSectionClick={onSectionClick}
            onInlineEdit={onInlineEdit}
            {...overrides}
        />,
    );
    return { onInlineEdit, onSectionClick, ...utils };
}

/** Find the rendered title element (data-i18n-field="title_i18n"). */
function findTitleEl(): HTMLElement {
    const el = document.querySelector(
        '[data-i18n-field="title_i18n"]',
    ) as HTMLElement | null;
    if (!el) throw new Error("title_i18n element not found");
    return el;
}

describe("LivePreview inline editing", () => {
    it("enters edit mode on dblclick on a [data-i18n-field] inside the selected section", () => {
        renderPreview();
        const title = findTitleEl();
        expect(title.getAttribute("contenteditable")).toBeNull();

        fireEvent.doubleClick(title);

        expect(title.getAttribute("contenteditable")).toBe("true");
        expect(title.getAttribute("data-inline-editing")).toBe("true");
        // Hint pill is mounted.
        expect(screen.getByTestId("live-preview-inline-edit-hint")).toBeTruthy();
    });

    it("commits debounced edits to the onInlineEdit prop while typing", () => {
        const { onInlineEdit } = renderPreview();
        const title = findTitleEl();
        fireEvent.doubleClick(title);

        // Simulate the user typing — mutate textContent + fire input.
        act(() => {
            title.textContent = "New title";
            title.dispatchEvent(new Event("input", { bubbles: true }));
        });

        // Debounced 300ms.
        expect(onInlineEdit).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(320);
        });
        expect(onInlineEdit).toHaveBeenCalledWith(
            "hero-1",
            "title_i18n",
            "en",
            "New title",
        );
    });

    it("reverts the text and exits edit mode on Escape", () => {
        const { onInlineEdit } = renderPreview();
        const title = findTitleEl();
        const original = title.textContent;
        fireEvent.doubleClick(title);

        act(() => {
            title.textContent = "Half-typed";
            title.dispatchEvent(new Event("input", { bubbles: true }));
        });

        fireEvent.keyDown(title, { key: "Escape" });

        expect(title.textContent).toBe(original);
        expect(title.getAttribute("contenteditable")).toBeNull();
        // Final commit must NOT fire on revert.
        // (Debounced timer is cleared before its 300ms elapses.)
        act(() => {
            vi.advanceTimersByTime(400);
        });
        expect(onInlineEdit).not.toHaveBeenCalled();
    });

    it("commits the final value and exits edit mode on Enter", () => {
        const { onInlineEdit } = renderPreview();
        const title = findTitleEl();
        fireEvent.doubleClick(title);

        act(() => {
            title.textContent = "Final!";
            title.dispatchEvent(new Event("input", { bubbles: true }));
        });

        fireEvent.keyDown(title, { key: "Enter" });

        expect(title.getAttribute("contenteditable")).toBeNull();
        expect(onInlineEdit).toHaveBeenCalledWith(
            "hero-1",
            "title_i18n",
            "en",
            "Final!",
        );
    });
});

describe("LivePreview inline-edit affordances", () => {
    it("shows the pencil chip on hover over a [data-i18n-field] inside the selected section", () => {
        renderPreview();
        const title = findTitleEl();
        // Chip is not visible at rest.
        expect(
            screen.queryByTestId("live-preview-inline-edit-chip"),
        ).toBeNull();
        // Hover the editable text — mousemove on the content tree drives
        // the chip state.
        fireEvent.mouseMove(title);
        expect(
            screen.getByTestId("live-preview-inline-edit-chip"),
        ).toBeTruthy();
    });

    it("does NOT show the pencil chip when hovering an editable field in an unselected section", () => {
        // Render two heroes, selecting hero-2 so hero-1's title is in an
        // unselected section.
        const onInlineEdit = vi.fn();
        render(
            <LivePreview
                config={makeConfigWithTwoHeroes()}
                pageId="home"
                breakpoint="desktop"
                locale="en"
                tenant={TENANT}
                selectedSectionId="hero-2"
                onInlineEdit={onInlineEdit}
            />,
        );
        // First title belongs to hero-1, the unselected section.
        const titles = document.querySelectorAll(
            '[data-i18n-field="title_i18n"]',
        );
        expect(titles.length).toBeGreaterThanOrEqual(2);
        const hero1Title = titles[0] as HTMLElement;
        fireEvent.mouseMove(hero1Title);
        expect(
            screen.queryByTestId("live-preview-inline-edit-chip"),
        ).toBeNull();
    });

    it("enters inline-edit mode on a single click of editable text inside the selected section", () => {
        renderPreview();
        const title = findTitleEl();
        expect(title.getAttribute("contenteditable")).toBeNull();
        fireEvent.click(title);
        expect(title.getAttribute("contenteditable")).toBe("true");
        expect(title.getAttribute("data-inline-editing")).toBe("true");
    });
});

describe("LivePreview insertion `+` buttons", () => {
    it("renders a `+` button at every gap when onAddAt is supplied", () => {
        const onAddAt = vi.fn();
        render(
            <LivePreview
                config={makeConfigWithTwoHeroes()}
                pageId="home"
                breakpoint="desktop"
                locale="en"
                tenant={TENANT}
                onAddAt={onAddAt}
            />,
        );
        // Two sections → 3 gaps → 3 insertion buttons.
        expect(
            document.querySelector(
                '[data-testid="live-preview-insert-button-0"]',
            ),
        ).toBeTruthy();
        expect(
            document.querySelector(
                '[data-testid="live-preview-insert-button-1"]',
            ),
        ).toBeTruthy();
        expect(
            document.querySelector(
                '[data-testid="live-preview-insert-button-2"]',
            ),
        ).toBeTruthy();
    });

    it("fires onAddAt with the gap index when the `+` is clicked", () => {
        const onAddAt = vi.fn();
        render(
            <LivePreview
                config={makeConfigWithTwoHeroes()}
                pageId="home"
                breakpoint="desktop"
                locale="en"
                tenant={TENANT}
                onAddAt={onAddAt}
            />,
        );
        const trigger = document.querySelector(
            '[data-testid="live-preview-insert-button-1-trigger"]',
        ) as HTMLButtonElement;
        expect(trigger).toBeTruthy();
        fireEvent.click(trigger);
        expect(onAddAt).toHaveBeenCalledWith(1);
    });

    it("renders no `+` buttons when onAddAt is omitted", () => {
        render(
            <LivePreview
                config={makeConfigWithTwoHeroes()}
                pageId="home"
                breakpoint="desktop"
                locale="en"
                tenant={TENANT}
            />,
        );
        expect(
            document.querySelector('[data-testid="live-preview-insert-button-0"]'),
        ).toBeNull();
    });
});

describe("LivePreview drop zones (picker drag)", () => {
    it("renders drop zones above each section + one below the last when pickerDragActive is true", () => {
        // Two sections → expect 3 drop zones (above hero-1, above hero-2, below hero-2).
        render(
            <DndContext>
                <LivePreview
                    config={makeConfigWithTwoHeroes()}
                    pageId="home"
                    breakpoint="desktop"
                    locale="en"
                    tenant={TENANT}
                    pickerDragActive
                />
            </DndContext>,
        );
        const zones = document.querySelectorAll("[data-insert-at]");
        expect(zones.length).toBe(3);
        // Indices 0..2 present.
        expect(
            document.querySelector('[data-testid="live-preview-drop-zone-0"]'),
        ).toBeTruthy();
        expect(
            document.querySelector('[data-testid="live-preview-drop-zone-1"]'),
        ).toBeTruthy();
        expect(
            document.querySelector('[data-testid="live-preview-drop-zone-2"]'),
        ).toBeTruthy();
    });

    it("renders no drop zones when pickerDragActive is false", () => {
        render(
            <DndContext>
                <LivePreview
                    config={makeConfigWithTwoHeroes()}
                    pageId="home"
                    breakpoint="desktop"
                    locale="en"
                    tenant={TENANT}
                />
            </DndContext>,
        );
        const zones = document.querySelectorAll("[data-insert-at]");
        expect(zones.length).toBe(0);
    });
});

describe("LivePreview spacing handles", () => {
    it("renders a spacing handle for each existing section gap (above sections 1..N)", () => {
        // Two sections → spacing handles above sections 1..N-1 = 1 handle
        // PLUS the "below last" gap can also resize the last section's
        // bottom — total 2.
        render(
            <LivePreview
                config={makeConfigWithTwoHeroes()}
                pageId="home"
                breakpoint="desktop"
                locale="en"
                tenant={TENANT}
            />,
        );
        const handles = document.querySelectorAll(
            '[data-testid="live-preview-spacing-handle"]',
        );
        // 2 sections → 2 handles (gap above section-2 resizes hero-1.bottom,
        // gap below section-2 resizes hero-2.bottom).
        expect(handles.length).toBe(2);
    });

    it("fires onSpacingChange with a clamped, snapped bottom_px on mouseup after a drag", () => {
        const onSpacingChange = vi.fn();
        render(
            <LivePreview
                config={makeConfigWithTwoHeroes()}
                pageId="home"
                breakpoint="desktop"
                locale="en"
                tenant={TENANT}
                onSpacingChange={onSpacingChange}
            />,
        );
        const handles = document.querySelectorAll(
            '[data-testid="live-preview-spacing-handle"]',
        ) as NodeListOf<HTMLElement>;
        expect(handles.length).toBeGreaterThan(0);
        const handle = handles[0];
        // Start drag at y=100; move to y=130 → +30px raw, snapped to 32px.
        fireEvent.mouseDown(handle, { clientY: 100 });
        act(() => {
            window.dispatchEvent(
                new MouseEvent("mousemove", {
                    clientY: 130,
                    bubbles: true,
                }),
            );
        });
        act(() => {
            window.dispatchEvent(
                new MouseEvent("mouseup", { clientY: 130, bubbles: true }),
            );
        });
        expect(onSpacingChange).toHaveBeenCalledTimes(1);
        const [, committedValue] = onSpacingChange.mock.calls[0];
        // 30 → snap to 32 (multiple of 4), within [0, 200].
        expect(committedValue).toBe(32);
    });

    it("clamps spacing-handle drag values to [0, 200]", () => {
        const onSpacingChange = vi.fn();
        render(
            <LivePreview
                config={makeConfigWithTwoHeroes()}
                pageId="home"
                breakpoint="desktop"
                locale="en"
                tenant={TENANT}
                onSpacingChange={onSpacingChange}
            />,
        );
        const handle = document.querySelector(
            '[data-testid="live-preview-spacing-handle"]',
        ) as HTMLElement;
        expect(handle).toBeTruthy();

        // Drag way past the upper bound.
        fireEvent.mouseDown(handle, { clientY: 0 });
        act(() => {
            window.dispatchEvent(
                new MouseEvent("mousemove", { clientY: 9999, bubbles: true }),
            );
        });
        act(() => {
            window.dispatchEvent(
                new MouseEvent("mouseup", { clientY: 9999, bubbles: true }),
            );
        });
        expect(onSpacingChange).toHaveBeenLastCalledWith(
            expect.any(String),
            200,
        );

        // Drag far below 0.
        onSpacingChange.mockClear();
        const handle2 = document.querySelector(
            '[data-testid="live-preview-spacing-handle"]',
        ) as HTMLElement;
        fireEvent.mouseDown(handle2, { clientY: 500 });
        act(() => {
            window.dispatchEvent(
                new MouseEvent("mousemove", {
                    clientY: -9999,
                    bubbles: true,
                }),
            );
        });
        act(() => {
            window.dispatchEvent(
                new MouseEvent("mouseup", { clientY: -9999, bubbles: true }),
            );
        });
        expect(onSpacingChange).toHaveBeenLastCalledWith(
            expect.any(String),
            0,
        );
    });
});
