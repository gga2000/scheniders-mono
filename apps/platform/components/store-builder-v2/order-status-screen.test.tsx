/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DEFAULT_NARRATIVES } from "@scheniders/shared";
import type { StoreConfigV2, StoreCommerceConfig } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { OrderStatusScreen } from "./order-status-screen";

afterEach(cleanup);

function makeBuilder(commerce?: Partial<StoreCommerceConfig>) {
    const setConfig = vi.fn();
    const config = { schema_version: 2, commerce } as unknown as StoreConfigV2;
    return { builder: { config, setConfig } as unknown as UseStoreBuilderV2Return, setConfig, config };
}

function applyLast(setConfig: ReturnType<typeof vi.fn>, config: StoreConfigV2): StoreConfigV2 {
    const updater = setConfig.mock.calls.at(-1)?.[0] as (c: StoreConfigV2) => StoreConfigV2;
    return updater(config);
}

describe("OrderStatusScreen", () => {
    it("lists every customer stage with the shipped default as its preview", () => {
        const { builder } = makeBuilder({ whatsapp_number: "07701234567" });
        render(<OrderStatusScreen builder={builder} onClose={() => {}} />);
        for (const stage of Object.keys(DEFAULT_NARRATIVES)) {
            expect(screen.getByTestId(`order-status-stage-${stage}`)).toBeTruthy();
        }
        // Editor locale defaults to English; the preview is the resolved line.
        expect(screen.getByTestId("order-status-preview-placed").textContent).toContain("We have your order");
        expect(screen.getByTestId("order-status-preview-placed").textContent).toContain("07701234567");
    });

    it("drops contact lines and buttons from the preview when no number is set — and says so", () => {
        const { builder } = makeBuilder();
        render(<OrderStatusScreen builder={builder} onClose={() => {}} />);
        expect(screen.getByTestId("order-status-no-contact")).toBeTruthy();
        const placed = screen.getByTestId("order-status-preview-placed").textContent ?? "";
        expect(placed).not.toContain("{contact}");
        expect(placed).not.toContain("Call us");
    });

    it("writes an edited headline under the stage and leaves untouched stages absent", () => {
        const { builder, setConfig, config } = makeBuilder();
        render(<OrderStatusScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("order-status-title-placed-input"), {
            target: { value: "Got it!" },
        });
        const next = applyLast(setConfig, config);
        expect(next.commerce?.order_status_narratives).toEqual({
            placed: { title_i18n: { en: "Got it!" } },
        });
    });

    it("clearing the only edited field removes the stage from the config", () => {
        const { builder, setConfig, config } = makeBuilder({
            order_status_narratives: { placed: { title_i18n: { en: "Got it!" } } },
        });
        render(<OrderStatusScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("order-status-title-placed-input"), { target: { value: "" } });
        expect(applyLast(setConfig, config).commerce?.order_status_narratives).toBeUndefined();
    });

    it("reset deletes the override and keeps the other stages", () => {
        const { builder, setConfig, config } = makeBuilder({
            order_status_narratives: {
                placed: { title_i18n: { en: "Got it!" } },
                shipped: { body_i18n: { en: "Courier is on the way" } },
            },
        });
        render(<OrderStatusScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("order-status-reset-placed"));
        expect(applyLast(setConfig, config).commerce?.order_status_narratives).toEqual({
            shipped: { body_i18n: { en: "Courier is on the way" } },
        });
    });

    it("switches a stage's button to a page link and stores the path", () => {
        const { builder, setConfig, config } = makeBuilder();
        render(<OrderStatusScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("order-status-toggle-shipped"));
        fireEvent.change(screen.getByTestId("order-status-cta-shipped"), { target: { value: "link" } });
        const withKind = applyLast(setConfig, config);
        expect(withKind.commerce?.order_status_narratives?.shipped?.cta?.kind).toBe("link");
        // The page re-mounts on the new config in the real builder; emulate it.
        cleanup();
        const setConfig2 = vi.fn();
        render(
            <OrderStatusScreen
                builder={{ config: withKind, setConfig: setConfig2 } as unknown as UseStoreBuilderV2Return}
                onClose={() => {}}
            />,
        );
        fireEvent.click(screen.getByTestId("order-status-toggle-shipped"));
        fireEvent.change(screen.getByTestId("order-status-cta-value-shipped"), { target: { value: "/policies/shipping" } });
        expect(applyLast(setConfig2, withKind).commerce?.order_status_narratives?.shipped?.cta).toEqual({
            kind: "link",
            value: "/policies/shipping",
        });
    });
});
