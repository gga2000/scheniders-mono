/// <reference types="vitest/globals" />

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { PageMeta } from "@scheniders/shared";
import { PageSeoPanel } from "./page-seo-panel";

afterEach(cleanup);

describe("PageSeoPanel", () => {
    it("renders the SERP preview from the active-locale title + storefront host", () => {
        render(
            <PageSeoPanel
                pageId="home"
                pageLabel="Home"
                meta={{ title: { en: "Best Store" } }}
                onChange={() => {}}
                activeLocale="en"
                storefrontUrl="https://shop.example.com"
                businessName="Biz"
            />,
        );
        const serp = screen.getByTestId("seo-serp-preview");
        expect(serp.textContent).toContain("Best Store");
        expect(serp.textContent).toContain("shop.example.com");
    });

    it("falls back to businessName in the SERP title when no meta title is set", () => {
        render(
            <PageSeoPanel
                pageId="home"
                pageLabel="Home"
                meta={undefined}
                onChange={() => {}}
                businessName="Acme"
            />,
        );
        expect(screen.getByTestId("seo-serp-preview").textContent).toContain("Acme");
    });

    it("commits a meta title edit as an I18nString", () => {
        const onChange = vi.fn();
        render(
            <PageSeoPanel
                pageId="home"
                pageLabel="Home"
                meta={{}}
                onChange={onChange}
                activeLocale="en"
            />,
        );
        fireEvent.change(screen.getByTestId("seo-title-input"), {
            target: { value: "New Title" },
        });
        expect(onChange).toHaveBeenCalled();
        const arg = onChange.mock.calls.at(-1)?.[0] as PageMeta;
        expect(arg.title?.en).toBe("New Title");
    });

    it("toggles noindex on", () => {
        const onChange = vi.fn();
        render(
            <PageSeoPanel
                pageId="policy_privacy"
                pageLabel="Privacy policy"
                meta={{}}
                onChange={onChange}
            />,
        );
        fireEvent.click(screen.getByTestId("seo-noindex-toggle"));
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ noindex: true }),
        );
    });

    it("sets the OG image url and shows a preview once present", () => {
        const onChange = vi.fn();
        const { rerender } = render(
            <PageSeoPanel
                pageId="home"
                pageLabel="Home"
                meta={{}}
                onChange={onChange}
            />,
        );
        expect(screen.queryByTestId("seo-og-image-preview")).toBeNull();
        fireEvent.change(screen.getByTestId("seo-og-image-input"), {
            target: { value: "https://x/og.jpg" },
        });
        expect(onChange).toHaveBeenCalledWith(
            expect.objectContaining({ og_image_url: "https://x/og.jpg" }),
        );
        rerender(
            <PageSeoPanel
                pageId="home"
                pageLabel="Home"
                meta={{ og_image_url: "https://x/og.jpg" }}
                onChange={onChange}
            />,
        );
        expect(screen.getByTestId("seo-og-image-preview")).toBeTruthy();
    });
});
