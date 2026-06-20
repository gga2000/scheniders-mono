/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { StoreConfigV2 } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { RedirectsScreen } from "./redirects-screen";

afterEach(cleanup);

function makeBuilder(redirects: StoreConfigV2["redirects"]) {
    const setConfig = vi.fn();
    const config = { schema_version: 2, redirects } as unknown as StoreConfigV2;
    const builder = { config, setConfig } as unknown as UseStoreBuilderV2Return;
    return { builder, setConfig, config };
}

/** Resolve the latest setConfig updater against a config. */
function applyLast(
    setConfig: ReturnType<typeof vi.fn>,
    config: StoreConfigV2,
): StoreConfigV2 {
    const updater = setConfig.mock.calls.at(-1)?.[0] as (
        c: StoreConfigV2,
    ) => StoreConfigV2;
    return updater(config);
}

describe("RedirectsScreen", () => {
    it("shows the empty state and adds a first row", () => {
        const { builder, setConfig, config } = makeBuilder([]);
        render(<RedirectsScreen builder={builder} onClose={() => {}} />);
        expect(screen.getByTestId("redirects-screen")).toBeTruthy();
        fireEvent.click(screen.getByTestId("redirects-empty-add"));
        const next = applyLast(setConfig, config);
        expect(next.redirects).toHaveLength(1);
        expect(next.redirects?.[0]).toEqual({
            from: "",
            to: "",
            permanent: true,
        });
    });

    it("edits a row's source via setConfig", () => {
        const { builder, setConfig, config } = makeBuilder([
            { from: "/a", to: "/b", permanent: true },
        ]);
        render(<RedirectsScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("redirect-from-0"), {
            target: { value: "/x" },
        });
        expect(applyLast(setConfig, config).redirects?.[0].from).toBe("/x");
    });

    it("surfaces a validation issue for duplicate sources", () => {
        const { builder } = makeBuilder([
            { from: "/a", to: "/b" },
            { from: "/A", to: "/c" },
        ]);
        render(<RedirectsScreen builder={builder} onClose={() => {}} />);
        expect(screen.getByTestId("redirect-issue-1").textContent).toMatch(
            /Duplicate/,
        );
    });

    it("removes a row", () => {
        const { builder, setConfig, config } = makeBuilder([
            { from: "/a", to: "/b" },
        ]);
        render(<RedirectsScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("redirect-remove-0"));
        expect(applyLast(setConfig, config).redirects).toHaveLength(0);
    });
});
