/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { StoreConfigV2, DiscountCode } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { DiscountsScreen } from "./discounts-screen";

afterEach(cleanup);

function makeBuilder(discounts?: DiscountCode[]) {
    const setConfig = vi.fn();
    const config = {
        schema_version: 2,
        commerce: discounts ? { discounts } : undefined,
    } as unknown as StoreConfigV2;
    return { builder: { config, setConfig } as unknown as UseStoreBuilderV2Return, setConfig, config };
}

function applyLast(setConfig: ReturnType<typeof vi.fn>, config: StoreConfigV2): StoreConfigV2 {
    const updater = setConfig.mock.calls.at(-1)?.[0] as (c: StoreConfigV2) => StoreConfigV2;
    return updater(config);
}

describe("DiscountsScreen", () => {
    it("shows the empty state and adds a first code", () => {
        const { builder, setConfig, config } = makeBuilder();
        render(<DiscountsScreen builder={builder} onClose={() => {}} />);
        expect(screen.getByTestId("discounts-screen")).toBeTruthy();
        fireEvent.click(screen.getByTestId("discounts-empty-add"));
        const next = applyLast(setConfig, config).commerce?.discounts;
        expect(next).toHaveLength(1);
        expect(next?.[0]).toMatchObject({ kind: "percent", enabled: true });
    });

    it("edits a code + value", () => {
        const { builder, setConfig, config } = makeBuilder([
            { code: "OLD", kind: "percent", value: 10, enabled: true },
        ]);
        render(<DiscountsScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("discount-code-0"), {
            target: { value: "SAVE20" },
        });
        expect(applyLast(setConfig, config).commerce?.discounts?.[0].code).toBe("SAVE20");
        fireEvent.change(screen.getByTestId("discount-value-0"), {
            target: { value: "25" },
        });
        expect(applyLast(setConfig, config).commerce?.discounts?.[0].value).toBe(25);
    });

    it("removes a code", () => {
        const { builder, setConfig, config } = makeBuilder([
            { code: "A", kind: "fixed", value: 5000 },
        ]);
        render(<DiscountsScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("discount-remove-0"));
        expect(applyLast(setConfig, config).commerce?.discounts).toHaveLength(0);
    });
});
