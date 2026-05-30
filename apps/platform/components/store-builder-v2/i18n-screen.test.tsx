/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { StoreConfigV2 } from "@scheniders/shared";
import { emptyStoreConfigV2 } from "@scheniders/shared";

import { I18nScreen, I18nToolbarPill } from "./i18n-screen";

afterEach(() => {
    cleanup();
});

function fresh(): StoreConfigV2 {
    return JSON.parse(JSON.stringify(emptyStoreConfigV2())) as StoreConfigV2;
}

function homeWithHero(): StoreConfigV2 {
    const cfg = fresh();
    cfg.enabled_locales = ["ar", "en"];
    cfg.pages = cfg.pages.map((p) =>
        p.page_id === "home"
            ? {
                  page_id: "home",
                  sections: [
                      {
                          id: "hero-1",
                          type: "hero_image",
                          enabled: true,
                          label: "Hero",
                          base: {
                              title_i18n: { en: "Hi", ar: "مرحبا" },
                              subtitle_i18n: { en: "Welcome" }, // ar missing
                              cta_label_i18n: { en: "Shop" }, // ar missing
                          },
                      },
                  ],
              }
            : p,
    );
    return cfg;
}

describe("I18nScreen", () => {
    it("lists pages with untranslated fields and lets you jump to a section", () => {
        const cfg = homeWithHero();
        const onSelectSection = vi.fn();
        const onSelectPage = vi.fn();
        render(
            <I18nScreen
                config={cfg}
                onSelectPage={onSelectPage}
                onSelectSection={onSelectSection}
            />,
        );

        // The home page tile should be present.
        expect(screen.getByTestId("i18n-page-home")).toBeTruthy();

        // The Arabic summary pill should report a non-zero percentage
        // (some strings are filled, some aren't).
        const arPill = screen.getByTestId("i18n-summary-pill-ar");
        expect(arPill.textContent).toMatch(/Arabic/);
        expect(arPill.textContent).toMatch(/%/);

        // Translate button should fire onSelectSection with hero id.
        const translateButtons = screen.getAllByTestId("i18n-jump-section");
        expect(translateButtons.length).toBeGreaterThan(0);
        fireEvent.click(translateButtons[0]!);
        expect(onSelectSection).toHaveBeenCalledWith("home", "hero-1");
    });

    it("toolbar pill renders the enabled locales with percentages", () => {
        const cfg = homeWithHero();
        const onClick = vi.fn();
        render(<I18nToolbarPill config={cfg} onClick={onClick} />);
        const pill = screen.getByTestId("i18n-toolbar-pill");
        expect(pill.textContent).toMatch(/ar/);
        expect(pill.textContent).toMatch(/en/);
        expect(pill.textContent).toMatch(/%/);
        fireEvent.click(pill);
        expect(onClick).toHaveBeenCalled();
    });
});
