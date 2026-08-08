/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { StoreConfigV2 } from "@scheniders/shared";
import { emptyStoreConfigV2, runHealthChecks, HEALTH_CHECKS } from "@scheniders/shared";
import { HealthChecklistScreen } from "./health-checklist-screen";

afterEach(() => {
    cleanup();
});

function freshEmpty(): StoreConfigV2 {
    return JSON.parse(JSON.stringify(emptyStoreConfigV2())) as StoreConfigV2;
}

function healthyConfig(): StoreConfigV2 {
    const cfg = freshEmpty();
    cfg.brand_kit.identity = {
        name: "Test",
        tagline: { en: "tag" },
        logo_url: "https://x/l.png",
        favicon_url: "https://x/f.ico",
        og_image_url: "https://x/og.jpg",
    };
    cfg.globals.analytics_pixels = {
        id: "p",
        type: "analytics_pixels",
        enabled: true,
        base: { meta_pixel_id: "123" },
    };
    cfg.globals.footer = {
        id: "f",
        type: "footer",
        enabled: true,
        base: {
            contact_phone: "+9647701234567",
            whatsapp_number: "+9647701234567",
            instagram_url: "https://instagram.com/x",
        },
    };
    for (const id of [
        "policy_privacy",
        "policy_shipping",
        "policy_returns",
        "policy_terms",
        "contact",
    ] as const) {
        const p = cfg.pages.find((p) => p.page_id === id);
        if (p) p.sections = [{ id: `${id}-1`, type: "about_block", enabled: true, base: { body: "x" } }];
    }
    const home = cfg.pages.find((p) => p.page_id === "home");
    if (home) {
        home.sections = [
            { id: "h1", type: "hero_image", enabled: true, base: { title: "Welcome", image_url: "https://x/h.jpg" } },
            { id: "h2", type: "product_grid", enabled: true, base: { title: "Picks" } },
            { id: "h3", type: "trust_strip", enabled: true, base: { pills: [{ label_i18n: { en: "Free shipping" } }] } },
        ];
        home.meta = { title: { en: "Test" }, description: { en: "desc" } };
    }
    const product = cfg.pages.find((p) => p.page_id === "product");
    if (product) product.sections = [{ id: "p1", type: "delivery_promise", enabled: true, base: { title: "Fast" } }];
    const cart = cfg.pages.find((p) => p.page_id === "cart");
    if (cart) cart.sections = [{ id: "c1", type: "promo_banner", enabled: true, base: { headline: "Free gift" } }];
    return cfg;
}

/* ─────────────────────────────────────────────────────────────────── */
/* Tests                                                               */
/* ─────────────────────────────────────────────────────────────────── */

describe("HealthChecklistScreen", () => {
    it("renders the score donut with the right percentage", () => {
        const cfg = freshEmpty();
        const expected = runHealthChecks(cfg).score;
        render(
            <HealthChecklistScreen
                config={cfg}
                tenantName="Test"
                onSelectSetting={() => {}}
                onSelectPage={() => {}}
            />,
        );
        expect(screen.getByTestId("health-score-donut")).toBeTruthy();
        const value = screen.getByTestId("health-score-value");
        expect(value.textContent).toBe(String(expected));
    });

    it("renders one row per health check when filter is 'all'", () => {
        const cfg = freshEmpty();
        render(
            <HealthChecklistScreen
                config={cfg}
                tenantName="Test"
                onSelectSetting={() => {}}
                onSelectPage={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("health-filter-all"));
        const list = screen.getByTestId("health-check-list");
        const rows = list.querySelectorAll('[data-testid^="health-check-row-"]');
        expect(rows.length).toBe(HEALTH_CHECKS.length);
    });

    it("filter chip 'failing' hides passing rows", () => {
        const cfg = healthyConfig();
        render(
            <HealthChecklistScreen
                config={cfg}
                tenantName="Test"
                onSelectSetting={() => {}}
                onSelectPage={() => {}}
            />,
        );
        // Default filter is "failing" (failing + warn).
        const list = screen.getByTestId("health-check-list");
        const rows = list.querySelectorAll('[data-testid^="health-check-row-"]');
        for (const r of rows) {
            const status = (r as HTMLElement).dataset.status;
            expect(status === "fail" || status === "warn").toBe(true);
        }
        // Now switch to "passing" and assert the inverse.
        fireEvent.click(screen.getByTestId("health-filter-passing"));
        const list2 = screen.getByTestId("health-check-list");
        const passingRows = list2.querySelectorAll('[data-testid^="health-check-row-"]');
        expect(passingRows.length).toBeGreaterThan(0);
        for (const r of passingRows) {
            expect((r as HTMLElement).dataset.status).toBe("pass");
        }
    });

    it("Fix button with kind=settings calls onSelectSetting with the key", () => {
        const cfg = freshEmpty();
        const onSelectSetting = vi.fn();
        render(
            <HealthChecklistScreen
                config={cfg}
                tenantName="Test"
                onSelectSetting={onSelectSetting}
                onSelectPage={() => {}}
            />,
        );
        // Find a check whose fix_action is settings-bound. The empty
        // config's `og_image_set` failure points at brand_kit.
        const btn = screen.getByTestId("health-fix-og_image_set");
        fireEvent.click(btn);
        expect(onSelectSetting).toHaveBeenCalledWith("brand_kit");
    });

    it("Fix button with kind=page calls onSelectPage", () => {
        const cfg = freshEmpty();
        const onSelectPage = vi.fn();
        const onClose = vi.fn();
        render(
            <HealthChecklistScreen
                config={cfg}
                tenantName="Test"
                onSelectSetting={() => {}}
                onSelectPage={onSelectPage}
                onClose={onClose}
            />,
        );
        // `privacy_policy_has_content` fails on empty config → kind=page → policy_privacy.
        const btn = screen.getByTestId("health-fix-privacy_policy_has_content");
        fireEvent.click(btn);
        expect(onSelectPage).toHaveBeenCalledWith("policy_privacy");
    });

    it("'Blocks publish' banner appears when blocking failures exist", () => {
        const cfg = freshEmpty();
        render(
            <HealthChecklistScreen
                config={cfg}
                tenantName="Test"
                onSelectSetting={() => {}}
                onSelectPage={() => {}}
            />,
        );
        const banner = screen.getByTestId("health-blocks-publish");
        expect(banner).toBeTruthy();
        expect(banner.textContent ?? "").toMatch(/Blocks publish/);
    });

    it("WhatsApp launch step captures the number inline (S3-01)", () => {
        const cfg = freshEmpty();
        const onSetWhatsappNumber = vi.fn();
        render(
            <HealthChecklistScreen
                config={cfg}
                tenantName="Test"
                onSelectSetting={() => {}}
                onSelectPage={() => {}}
                hasPublished={false}
                onSetWhatsappNumber={onSetWhatsappNumber}
            />,
        );
        // The fix button opens the inline input instead of navigating.
        fireEvent.click(screen.getByTestId("health-launch-fix-whatsapp"));
        const inline = screen.getByTestId("health-launch-whatsapp-inline");
        const input = inline.querySelector("input") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "0770 123-4567" } });
        fireEvent.click(screen.getByTestId("health-launch-whatsapp-save"));
        // Saved digits-only; spaces/dashes stripped.
        expect(onSetWhatsappNumber).toHaveBeenCalledWith("07701234567");
    });

    it("WhatsApp inline capture rejects an implausible number", () => {
        const cfg = freshEmpty();
        const onSetWhatsappNumber = vi.fn();
        render(
            <HealthChecklistScreen
                config={cfg}
                tenantName="Test"
                onSelectSetting={() => {}}
                onSelectPage={() => {}}
                hasPublished={false}
                onSetWhatsappNumber={onSetWhatsappNumber}
            />,
        );
        fireEvent.click(screen.getByTestId("health-launch-fix-whatsapp"));
        const inline = screen.getByTestId("health-launch-whatsapp-inline");
        const input = inline.querySelector("input") as HTMLInputElement;
        fireEvent.change(input, { target: { value: "123" } });
        fireEvent.click(screen.getByTestId("health-launch-whatsapp-save"));
        expect(onSetWhatsappNumber).not.toHaveBeenCalled();
        expect(inline.querySelector('[role="alert"]')).toBeTruthy();
    });

    it("WhatsApp step is born completed when the config carries a number", () => {
        const cfg = freshEmpty();
        cfg.commerce = { whatsapp_number: "07701234567" };
        render(
            <HealthChecklistScreen
                config={cfg}
                tenantName="Test"
                onSelectSetting={() => {}}
                onSelectPage={() => {}}
                hasPublished={false}
                onSetWhatsappNumber={() => {}}
            />,
        );
        const step = screen.getByTestId("health-launch-step-whatsapp");
        expect((step as HTMLElement).dataset.done).toBe("true");
    });

    it("'Blocks publish' banner is absent when no blocking failures exist", () => {
        const cfg = healthyConfig();
        render(
            <HealthChecklistScreen
                config={cfg}
                tenantName="Test"
                onSelectSetting={() => {}}
                onSelectPage={() => {}}
            />,
        );
        expect(screen.queryByTestId("health-blocks-publish")).toBeNull();
    });
});
