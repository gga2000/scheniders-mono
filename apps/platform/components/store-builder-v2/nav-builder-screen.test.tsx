/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { StoreConfigV2, SectionInstance } from "@scheniders/shared";
import type { UseStoreBuilderV2Return } from "@/hooks/use-store-builder-v2";
import { NavBuilderScreen } from "./nav-builder-screen";

afterEach(cleanup);

type NavLink = { label_i18n: { en?: string; ar?: string }; href: string };

function makeBuilder(navLinks?: NavLink[]) {
    const setConfig = vi.fn();
    const header = navLinks
        ? ({ id: "h", type: "site_header", enabled: true, base: { nav_links: navLinks } } as unknown as SectionInstance)
        : undefined;
    const config = {
        schema_version: 2,
        globals: header ? { header } : {},
    } as unknown as StoreConfigV2;
    return { builder: { config, setConfig } as unknown as UseStoreBuilderV2Return, setConfig, config };
}

function links(setConfig: ReturnType<typeof vi.fn>, config: StoreConfigV2): NavLink[] {
    const updater = setConfig.mock.calls.at(-1)?.[0] as (c: StoreConfigV2) => StoreConfigV2;
    const base = (updater(config).globals?.header?.base ?? {}) as { nav_links?: NavLink[] };
    return base.nav_links ?? [];
}

describe("NavBuilderScreen", () => {
    it("adds a link, seeding the header when none exists", () => {
        const { builder, setConfig, config } = makeBuilder();
        render(<NavBuilderScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("nav-builder-empty-add"));
        const updater = setConfig.mock.calls.at(-1)?.[0] as (c: StoreConfigV2) => StoreConfigV2;
        const header = updater(config).globals?.header;
        expect(header?.type).toBe("site_header");
        const base = header?.base as { nav_links: NavLink[] };
        expect(base.nav_links).toHaveLength(1);
    });

    it("edits label + href", () => {
        const { builder, setConfig, config } = makeBuilder([
            { label_i18n: { en: "Home" }, href: "/" },
        ]);
        render(<NavBuilderScreen builder={builder} onClose={() => {}} />);
        fireEvent.change(screen.getByTestId("nav-link-href-0"), {
            target: { value: "/products" },
        });
        expect(links(setConfig, config)[0].href).toBe("/products");
        fireEvent.change(screen.getByTestId("nav-link-label-ar-0"), {
            target: { value: "الرئيسية" },
        });
        expect(links(setConfig, config)[0].label_i18n.ar).toBe("الرئيسية");
    });

    it("reorders and removes links", () => {
        const { builder, setConfig, config } = makeBuilder([
            { label_i18n: { en: "A" }, href: "/a" },
            { label_i18n: { en: "B" }, href: "/b" },
        ]);
        render(<NavBuilderScreen builder={builder} onClose={() => {}} />);
        fireEvent.click(screen.getByTestId("nav-link-down-0"));
        expect(links(setConfig, config).map((l) => l.href)).toEqual(["/b", "/a"]);
        fireEvent.click(screen.getByTestId("nav-link-remove-0"));
        expect(links(setConfig, config)).toHaveLength(1);
    });
});
