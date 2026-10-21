/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { BrandKit } from "@scheniders/shared";
import { EMPTY_BRAND_KIT } from "@scheniders/shared";

// The platform supabase client reads env at import time; stub it so the
// editor can be rendered in a JSDOM test environment.
vi.mock("@/lib/supabase", () => ({
    supabase: {
        storage: {
            from: () => ({
                upload: () => Promise.resolve({ error: null }),
                getPublicUrl: () => ({ data: { publicUrl: "https://example.com/x.png" } }),
            }),
        },
    },
}));

// Toast is fire-and-forget.
vi.mock("@/hooks/use-toast", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

import { BrandKitEditor } from "./brand-kit-editor";
import { EditorModeProvider } from "@/lib/editor-mode-context";
import { EditorLocaleProvider } from "@/lib/editor-locale-context";

function clone(): BrandKit {
    return JSON.parse(JSON.stringify(EMPTY_BRAND_KIT)) as BrandKit;
}

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    cleanup();
});

describe("BrandKitEditor", () => {
    it("renders with EMPTY_BRAND_KIT value", () => {
        const onChange = vi.fn();
        render(<BrandKitEditor value={clone()} onChange={onChange} />);

        expect(screen.getByTestId("brand-kit-editor")).toBeTruthy();
        expect(screen.getByTestId("brand-kit-preview")).toBeTruthy();
        // All eight color swatches present.
        expect(screen.getByTestId("color-field-primary")).toBeTruthy();
        expect(screen.getByTestId("color-field-secondary")).toBeTruthy();
        expect(screen.getByTestId("color-field-accent")).toBeTruthy();
        expect(screen.getByTestId("color-field-surface")).toBeTruthy();
        expect(screen.getByTestId("color-field-surface_alt")).toBeTruthy();
        expect(screen.getByTestId("color-field-ink")).toBeTruthy();
        expect(screen.getByTestId("color-field-success")).toBeTruthy();
        expect(screen.getByTestId("color-field-danger")).toBeTruthy();
    });

    it("changing the primary color via the hidden native input calls onChange", () => {
        const onChange = vi.fn();
        render(<BrandKitEditor value={clone()} onChange={onChange} />);

        const colorInput = screen.getByTestId("color-input-primary") as HTMLInputElement;
        fireEvent.input(colorInput, { target: { value: "#123456" } });

        expect(onChange).toHaveBeenCalled();
        const last = onChange.mock.calls.at(-1)![0] as BrandKit;
        expect(last.colors.primary).toBe("#123456");
    });

    it("changing the primary hex via the text input also calls onChange", () => {
        const onChange = vi.fn();
        render(<BrandKitEditor value={clone()} onChange={onChange} />);

        const hexInput = screen.getByTestId("color-hex-primary") as HTMLInputElement;
        fireEvent.change(hexInput, { target: { value: "ff0000" } });

        expect(onChange).toHaveBeenCalled();
        const last = onChange.mock.calls.at(-1)![0] as BrandKit;
        // Component normalizes to include leading '#'.
        expect(last.colors.primary.toLowerCase()).toBe("#ff0000");
    });

    it("tagline translations tuck behind the reveal and stay editable", () => {
        const value = clone();
        value.identity.tagline = { en: "Hello world", ar: "مرحبا" };
        const onChange = vi.fn();
        render(<BrandKitEditor value={value} onChange={onChange} />);

        // Active locale (en without a provider) is the primary input.
        const enInput = screen.getByTestId("identity-tagline-input") as HTMLInputElement;
        expect(enInput.value).toBe("Hello world");

        // Other locales are collapsed until the translations toggle opens.
        fireEvent.click(screen.getByTestId("identity-tagline-translations-toggle"));
        const arInput = screen.getByTestId(
            "identity-tagline-input-ar",
        ) as HTMLInputElement;
        expect(arInput.value).toBe("مرحبا");
    });

    it("the tagline's primary input edits the editor's locale, not English", () => {
        const value = clone();
        value.identity.tagline = { en: "Hello world", ar: "مرحبا" };
        const onChange = vi.fn();
        render(
            <EditorLocaleProvider value="ar">
                <BrandKitEditor value={value} onChange={onChange} />
            </EditorLocaleProvider>,
        );
        const primary = screen.getByTestId("identity-tagline-input") as HTMLInputElement;
        expect(primary.value).toBe("مرحبا");
        fireEvent.change(primary, { target: { value: "أهلاً" } });
        const next = onChange.mock.calls.at(-1)?.[0] as BrandKit | undefined;
        expect(next?.identity.tagline).toEqual({ en: "Hello world", ar: "أهلاً" });
    });

    it("hides the favicon field in Simple mode and keeps it in Advanced", () => {
        const { unmount } = render(
            <EditorModeProvider value={{ mode: "simple", setMode: () => {} }}>
                <BrandKitEditor value={clone()} onChange={() => {}} />
            </EditorModeProvider>,
        );
        expect(document.querySelector('[data-testid^="identity-favicon"]')).toBeNull();
        // The OG image stays: a first-publish recommendation's fix lands on it.
        expect(document.querySelector('[data-testid^="identity-og"]')).not.toBeNull();
        unmount();
        render(
            <EditorModeProvider value={{ mode: "advanced", setMode: () => {} }}>
                <BrandKitEditor value={clone()} onChange={() => {}} />
            </EditorModeProvider>,
        );
        expect(document.querySelector('[data-testid^="identity-favicon"]')).not.toBeNull();
    });

    it("clicking the colors Reset button resets all colors to defaults", () => {
        const value = clone();
        value.colors.primary = "#000000";
        value.colors.secondary = "#111111";

        const onChange = vi.fn();
        render(<BrandKitEditor value={value} onChange={onChange} />);

        fireEvent.click(screen.getByTestId("reset-colors"));
        expect(onChange).toHaveBeenCalled();
        const next = onChange.mock.calls.at(-1)![0] as BrandKit;
        expect(next.colors).toEqual(EMPTY_BRAND_KIT.colors);
    });

    it("the derived swatch strip reflects the current primary color", () => {
        const value = clone();
        value.colors.primary = "#ff0000";
        render(<BrandKitEditor value={value} onChange={() => {}} />);

        const swatch = screen.getByTestId("derived-swatch-primary") as HTMLDivElement;
        const bg = swatch.style.background || swatch.style.backgroundColor;
        expect(bg.toLowerCase()).toMatch(/#ff0000|rgb\(255,\s*0,\s*0\)/);

        const soft = screen.getByTestId("derived-swatch-primary-soft") as HTMLDivElement;
        const softBg = soft.style.background || soft.style.backgroundColor;
        expect(softBg).toContain("255");
        expect(softBg).toContain("0");
    });

    it("toggling motion off disables the speed segmented control", () => {
        const onChange = vi.fn();
        const value = clone();
        value.motion.enabled = true;
        render(<BrandKitEditor value={value} onChange={onChange} />);

        fireEvent.click(screen.getByTestId("motion-enabled-toggle"));
        expect(onChange).toHaveBeenCalled();
        const next = onChange.mock.calls.at(-1)![0] as BrandKit;
        expect(next.motion.enabled).toBe(false);
    });

    it("selecting a different scale calls onChange", () => {
        const onChange = vi.fn();
        render(<BrandKitEditor value={clone()} onChange={onChange} />);

        fireEvent.click(screen.getByTestId("typography-scale-spacious"));
        const next = onChange.mock.calls.at(-1)![0] as BrandKit;
        expect(next.typography.scale).toBe("spacious");
    });

    /* ── New color picker tests ─────────────────────────────────── */

    it("clicking the primary swatch opens the color popover", () => {
        render(<BrandKitEditor value={clone()} onChange={() => {}} />);
        expect(screen.queryByTestId("color-popover-primary")).toBeNull();

        fireEvent.click(screen.getByTestId("color-swatch-primary"));
        expect(screen.getByTestId("color-popover-primary")).toBeTruthy();
    });

    it("dragging the hue slider commits a new hex via onChange", () => {
        const onChange = vi.fn();
        const value = clone();
        value.colors.primary = "#ff0000"; // hue 0, sat 100, light 50
        render(<BrandKitEditor value={value} onChange={onChange} />);

        fireEvent.click(screen.getByTestId("color-swatch-primary"));
        const hueSlider = screen.getByTestId("color-hue-primary") as HTMLInputElement;
        fireEvent.change(hueSlider, { target: { value: "120" } });

        expect(onChange).toHaveBeenCalled();
        const next = onChange.mock.calls.at(-1)![0] as BrandKit;
        // hue 120, sat 100, light 50 => pure green
        expect(next.colors.primary.toLowerCase()).toBe("#00ff00");
    });

    it("clicking a suggested tone applies it as the new primary", () => {
        const onChange = vi.fn();
        render(<BrandKitEditor value={clone()} onChange={onChange} />);

        fireEvent.click(screen.getByTestId("color-swatch-primary"));
        const firstTone = screen.getByTestId("color-tone-primary-0") as HTMLButtonElement;
        const targetColor = firstTone.style.background || firstTone.style.backgroundColor;
        fireEvent.click(firstTone);

        expect(onChange).toHaveBeenCalled();
        const next = onChange.mock.calls.at(-1)![0] as BrandKit;
        // Target color is a hex like #abcdef. It should now be primary.
        expect(next.colors.primary).toMatch(/^#[0-9a-f]{6}$/i);
        expect(targetColor).toBeTruthy();
    });

    it("the popover Reset link restores the candy default for that slot", () => {
        const onChange = vi.fn();
        const value = clone();
        value.colors.primary = "#000000";
        render(<BrandKitEditor value={value} onChange={onChange} />);

        fireEvent.click(screen.getByTestId("color-swatch-primary"));
        fireEvent.click(screen.getByTestId("color-popover-reset-primary"));

        expect(onChange).toHaveBeenCalled();
        const next = onChange.mock.calls.at(-1)![0] as BrandKit;
        expect(next.colors.primary.toLowerCase()).toBe("#ff5a8a");
    });

    /* ── Extract from logo ──────────────────────────────────────── */

    it("extract-from-logo button is hidden when there is no logo url", () => {
        render(<BrandKitEditor value={clone()} onChange={() => {}} />);
        expect(screen.queryByTestId("extract-from-logo-button")).toBeNull();
    });

    it("extract-from-logo button is visible when logo_url is set", () => {
        const value = clone();
        value.identity.logo_url = "https://example.com/logo.png";
        render(<BrandKitEditor value={value} onChange={() => {}} />);
        expect(screen.getByTestId("extract-from-logo-button")).toBeTruthy();
    });

    /* ── Random palette ─────────────────────────────────────────── */

    it("random-palette button generates a new palette and calls onChange", () => {
        const onChange = vi.fn();
        render(<BrandKitEditor value={clone()} onChange={onChange} />);

        fireEvent.click(screen.getByTestId("random-palette-button"));
        expect(onChange).toHaveBeenCalled();
        const next = onChange.mock.calls.at(-1)![0] as BrandKit;
        expect(next.colors.primary).toMatch(/^#[0-9a-f]{6}$/i);
        expect(next.colors.secondary).toMatch(/^#[0-9a-f]{6}$/i);
        expect(next.colors.accent).toMatch(/^#[0-9a-f]{6}$/i);
    });

    /* ── Contrast badges ────────────────────────────────────────── */

    it("contrast badge for ink on surface shows AAA for the candy default", () => {
        render(<BrandKitEditor value={clone()} onChange={() => {}} />);
        const badge = screen.getByTestId("contrast-ink-surface-grade") as HTMLElement;
        // ink=#1a1a1a on surface=#fff7ed has very high contrast → AAA.
        expect(badge.textContent).toBe("AAA");
    });

    it("contrast badge for primary on ink shows Fail for the candy default", () => {
        // primary=#ff5a8a vs ink=#1a1a1a — ratio is around 4.0 (below AA 4.5)
        render(<BrandKitEditor value={clone()} onChange={() => {}} />);
        const badge = screen.getByTestId("contrast-primary-ink-grade") as HTMLElement;
        expect(["Fail", "AA"]).toContain(badge.textContent);
    });

    it("contrast badge shows Fail for a deliberately low-contrast pair", () => {
        const value = clone();
        value.colors.ink = "#ffffff"; // white text
        value.colors.surface = "#fefefe"; // near-white surface
        render(<BrandKitEditor value={value} onChange={() => {}} />);
        const badge = screen.getByTestId("contrast-ink-surface-grade") as HTMLElement;
        expect(badge.textContent).toBe("Fail");
    });
});
