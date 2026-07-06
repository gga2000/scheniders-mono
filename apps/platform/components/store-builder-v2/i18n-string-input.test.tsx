/// <reference types="vitest/globals" />

// Translation tuck-away behavior (Phase 1 / UX-05, UX-13): one language
// at a time, other locales behind a single reveal, copy-from-active,
// and byte-identical round-trips for untouched locales.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { I18nStringInput } from "./i18n-string-input";
import type { I18nString } from "@scheniders/shared";

afterEach(() => {
    cleanup();
});

describe("I18nStringInput — tuck-away", () => {
    it("renders ONLY the active-locale input by default, even when other locales have content", () => {
        render(
            <I18nStringInput
                label="Title"
                value={{ ar: "مرحبا", en: "Hello", ku: "سڵاو" }}
                onChange={() => {}}
                activeLocale="ar"
            />,
        );
        const active = screen.getByTestId("i18n-input-input") as HTMLInputElement;
        expect(active.value).toBe("مرحبا");
        // Secondary inputs collapsed — fill state lives on the toggle.
        expect(screen.queryByTestId("i18n-input-input-en")).toBeNull();
        expect(screen.queryByTestId("i18n-input-input-ku")).toBeNull();
        const toggle = screen.getByTestId("i18n-input-translations-toggle");
        expect(toggle.textContent).toContain("EN ✓");
        expect(toggle.textContent).toContain("KU ✓");
    });

    it("shows – fill state for empty locales", () => {
        render(
            <I18nStringInput
                label="Title"
                value={{ ar: "مرحبا" }}
                onChange={() => {}}
                activeLocale="ar"
            />,
        );
        const toggle = screen.getByTestId("i18n-input-translations-toggle");
        expect(toggle.textContent).toContain("EN –");
        expect(toggle.textContent).toContain("KU –");
    });

    it("expands secondary locales on demand and hides them again", () => {
        render(
            <I18nStringInput
                label="Title"
                value={{ ar: "مرحبا", en: "Hello" }}
                onChange={() => {}}
                activeLocale="ar"
            />,
        );
        fireEvent.click(screen.getByTestId("i18n-input-translations-toggle"));
        expect(
            (screen.getByTestId("i18n-input-input-en") as HTMLInputElement).value,
        ).toBe("Hello");
        fireEvent.click(screen.getByTestId("i18n-input-translations-hide"));
        expect(screen.queryByTestId("i18n-input-input-en")).toBeNull();
    });

    it("editing the active locale preserves untouched locales byte-identical", () => {
        const onChange = vi.fn();
        render(
            <I18nStringInput
                label="Title"
                value={{ ar: "مرحبا", en: "Hello", ku: "سڵاو" }}
                onChange={onChange}
                activeLocale="ar"
            />,
        );
        fireEvent.change(screen.getByTestId("i18n-input-input"), {
            target: { value: "أهلاً" },
        });
        expect(onChange).toHaveBeenCalledWith({
            ar: "أهلاً",
            en: "Hello",
            ku: "سڵاو",
        } satisfies I18nString);
    });

    it("copy-from-active fills an empty secondary locale with the active value", () => {
        const onChange = vi.fn();
        render(
            <I18nStringInput
                label="Title"
                value={{ ar: "مرحبا" }}
                onChange={onChange}
                activeLocale="ar"
            />,
        );
        fireEvent.click(screen.getByTestId("i18n-input-translations-toggle"));
        fireEvent.click(screen.getByTestId("i18n-input-copy-en"));
        expect(onChange).toHaveBeenCalledWith({ ar: "مرحبا", en: "مرحبا" });
    });

    it("clearing a locale removes its key instead of storing an empty string", () => {
        const onChange = vi.fn();
        render(
            <I18nStringInput
                label="Title"
                value={{ ar: "مرحبا", en: "Hello" }}
                onChange={onChange}
                activeLocale="ar"
            />,
        );
        fireEvent.click(screen.getByTestId("i18n-input-translations-toggle"));
        fireEvent.change(screen.getByTestId("i18n-input-input-en"), {
            target: { value: "" },
        });
        expect(onChange).toHaveBeenCalledWith({ ar: "مرحبا" });
    });

    it("shows the EN fallback hint when the active non-EN locale is empty", () => {
        render(
            <I18nStringInput
                label="Title"
                value={{ en: "Hello" }}
                onChange={() => {}}
                activeLocale="ar"
            />,
        );
        const hint = screen.getByTestId("i18n-input-fallback");
        expect(hint.textContent).toContain("Hello");
    });
});
