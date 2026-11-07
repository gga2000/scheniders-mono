/// <reference types="vitest/globals" />

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { GlobalSections, SectionInstance } from "@scheniders/shared";
import {
    SitewideEditor,
    SitewideStrip,
    defaultSlotId,
    sitewideInstance,
    slotForSectionId,
} from "./sitewide-parts";

afterEach(cleanup);

const header: SectionInstance = { id: "hdr", type: "site_header", enabled: true, base: {} };

describe("sitewide helpers", () => {
    it("uses the store's own section, else the storefront's built-in default", () => {
        expect(sitewideInstance({ header }, "header")).toBe(header);
        const def = sitewideInstance({}, "footer");
        expect(def?.id).toBe(defaultSlotId("footer"));
        expect(def?.type).toBe("site_footer");
        expect(def?.enabled).toBe(true);
    });

    it("maps a preview click to its slot", () => {
        const g: GlobalSections = { header };
        expect(slotForSectionId(g, "hdr")).toBe("header");
        expect(slotForSectionId(g, "__default_promo_bar__")).toBe("promo_bar");
        expect(slotForSectionId(g, "some-page-section")).toBeNull();
        expect(slotForSectionId(g, null)).toBeNull();
    });
});

describe("SitewideStrip", () => {
    it("lists top bar, header and footer, and hides one from the store", () => {
        const onChange = vi.fn();
        const onEdit = vi.fn();
        render(<SitewideStrip globals={{ header }} onChange={onChange} onEdit={onEdit} locale="en" />);
        expect(screen.getByTestId("sitewide-edit-promo_bar").textContent).toContain("Top bar");
        expect(screen.getByTestId("sitewide-edit-header").textContent).toContain("Header");
        expect(screen.getByTestId("sitewide-edit-footer").textContent).toContain("Footer");

        fireEvent.click(screen.getByTestId("sitewide-toggle-header"));
        expect(onChange).toHaveBeenCalledWith("header", { ...header, enabled: false });

        fireEvent.click(screen.getByTestId("sitewide-edit-footer"));
        expect(onEdit).toHaveBeenCalledWith("footer");
    });
});

describe("SitewideEditor", () => {
    it("opens the slot's form and goes back", () => {
        const onEdit = vi.fn();
        render(
            <SitewideEditor
                globals={{ header }}
                onChange={() => {}}
                editing="header"
                onEdit={onEdit}
                locale="en"
            />,
        );
        expect(screen.getByTestId("sitewide-editor-header")).toBeTruthy();
        fireEvent.click(screen.getByTestId("sitewide-back"));
        expect(onEdit).toHaveBeenCalledWith(null);
    });
});
