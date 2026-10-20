/// <reference types="vitest/globals" />
// @vitest-environment jsdom

// LinkPickerField — every *_href on every section goes through this one
// control, so a merchant who cannot reach a destination kind here cannot
// link a CTA there at all. These tests drive it the way a merchant does:
// press a destination kind, then choose.

import { describe, it, expect, vi, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { CustomPage } from "@scheniders/shared";
import { EditorLinkTargetsProvider } from "@/lib/editor-link-targets-context";

vi.mock("@/hooks/use-builder-resources", () => ({
    useBuilderProducts: () => ({
        data: [{ id: "p1", name: "قهوة عربية", slug: "arabic-coffee", image_url: null, price: 15000, is_visible: true }],
    }),
    useBuilderCategories: () => ({
        data: [
            { id: "c1", name: "بن", slug: "beans", image_url: null },
            { id: "c2", name: "بلا رابط", slug: null, image_url: null },
        ],
    }),
    useBuilderAttributes: () => ({ data: [] }),
}));

import { LinkPickerField } from "./resource-picker";

afterEach(cleanup);

const CUSTOM_PAGES: CustomPage[] = [
    { id: "cp1", slug: "eid-sale", title: { ar: "عروض العيد", en: "Eid sale" }, sections: [] },
];

/** A parent that stores what the picker writes, like the section editor does. */
function Harness({ initial, onWrite }: { initial: string; onWrite: (v: unknown) => void }) {
    const [value, setValue] = useState<unknown>(initial);
    return (
        <EditorLinkTargetsProvider customPages={CUSTOM_PAGES}>
            <LinkPickerField
                label="Button link"
                value={value}
                onChange={(next) => {
                    onWrite(next);
                    setValue(next);
                }}
                locale="en"
                testId="link"
            />
        </EditorLinkTargetsProvider>
    );
}

function setup(initial: string) {
    const onWrite = vi.fn();
    render(<Harness initial={initial} onWrite={onWrite} />);
    return { onWrite };
}

const kind = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const control = () => screen.getByTestId("link") as HTMLInputElement | HTMLSelectElement;

describe("LinkPickerField — destination kinds", () => {
    it("opens the category list from an empty link, then stores the chosen category", () => {
        const { onWrite } = setup("");
        kind("A category");
        // Pressing a kind is not a choice: nothing is written yet.
        expect(onWrite).not.toHaveBeenCalled();
        const select = control();
        expect(select.tagName).toBe("SELECT");
        expect(screen.getByRole("option", { name: "بن" })).toBeTruthy();
        fireEvent.change(select, { target: { value: "beans" } });
        expect(onWrite).toHaveBeenLastCalledWith("/categories/beans");
    });

    it("moves on to a web address and stores what the merchant types", () => {
        const { onWrite } = setup("");
        kind("A category");
        kind("A web address");
        const input = control();
        expect(input.tagName).toBe("INPUT");
        fireEvent.change(input, { target: { value: "https://wa.me/9647700000000" } });
        expect(onWrite).toHaveBeenLastCalledWith("https://wa.me/9647700000000");
        expect((control() as HTMLInputElement).value).toBe("https://wa.me/9647700000000");
    });

    it("keeps the web-address box open while a path is typed into it", () => {
        // "/" on its own reads as a store page; the box must not swap under
        // the merchant's cursor.
        setup("");
        kind("A web address");
        fireEvent.change(control(), { target: { value: "/" } });
        expect(control().tagName).toBe("INPUT");
        expect((control() as HTMLInputElement).value).toBe("/");
    });

    it("links to a product from a page link, keeping the old link until one is picked", () => {
        const { onWrite } = setup("/about");
        kind("A product");
        expect(onWrite).not.toHaveBeenCalled();
        expect(screen.getByText("/about")).toBeTruthy();
        fireEvent.change(control(), { target: { value: "arabic-coffee" } });
        expect(onWrite).toHaveBeenLastCalledWith("/products/arabic-coffee");
    });

    it("lists only categories that have a slug to link to", () => {
        setup("");
        kind("A category");
        expect(screen.queryByRole("option", { name: "بلا رابط" })).toBeNull();
    });
});

describe("LinkPickerField — what a stored link shows", () => {
    it("shows a custom page link as that custom page", () => {
        setup("/p/eid-sale");
        const select = control() as HTMLSelectElement;
        expect(select.tagName).toBe("SELECT");
        expect(select.value).toBe("eid-sale");
        expect(screen.getByRole("option", { name: "Eid sale" })).toBeTruthy();
    });

    it("stores /p/<slug> when a custom page is chosen", () => {
        const { onWrite } = setup("");
        kind("A custom page");
        fireEvent.change(control(), { target: { value: "eid-sale" } });
        expect(onWrite).toHaveBeenLastCalledWith("/p/eid-sale");
    });

    it("shows /search as the search page, not as unset", () => {
        setup("/search");
        expect((control() as HTMLSelectElement).value).toBe("/search");
    });

    it("shows a store path the list does not name as an editable value", () => {
        const { onWrite } = setup("/products?sort=sale");
        const input = screen.getByDisplayValue("/products?sort=sale");
        fireEvent.change(input, { target: { value: "/products?sort=new" } });
        expect(onWrite).toHaveBeenLastCalledWith("/products?sort=new");
        expect(screen.getByDisplayValue("/products?sort=new")).toBeTruthy();
    });

    it("lets the merchant pick a listed page after an unlisted path", () => {
        const { onWrite } = setup("/products?sort=sale");
        const select = screen.getByRole("combobox", { name: "Button link" });
        fireEvent.change(select, { target: { value: "/products" } });
        expect(onWrite).toHaveBeenLastCalledWith("/products");
        expect(screen.queryByDisplayValue("/products?sort=sale")).toBeNull();
    });

    it("shows a product that no longer exists by its slug instead of an empty box", () => {
        setup("/products/discontinued-blend");
        const select = control() as HTMLSelectElement;
        expect(select.value).toBe("discontinued-blend");
        expect(select.selectedOptions[0]?.textContent).toContain("discontinued-blend");
    });
});
