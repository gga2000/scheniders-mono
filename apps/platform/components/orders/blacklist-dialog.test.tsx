// @vitest-environment jsdom
// The block dialog is shared by Orders and Customers. Customers uses one danger red
// (the Block button's crimson) for the chosen reason; the Orders look is frozen, so the
// default variant must keep its exact classes.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (key: string) => key, language: "en" }),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

import { BlacklistDialog } from "./blacklist-dialog";

afterEach(cleanup);

const CHIP_BASE = "px-3 py-1.5 rounded-full text-xs font-medium border transition-all";
const THREAT = "orders.blacklist.reasonPreset.threat";

function renderDialog(variant?: "orders" | "customers") {
    render(
        <BlacklistDialog
            open
            onClose={() => {}}
            mode="add"
            customerName="Nour"
            customerPhone="07801231231"
            onConfirm={async () => {}}
            variant={variant}
        />,
    );
    return screen.getByRole("button", { name: THREAT });
}

describe("BlacklistDialog reason chips", () => {
    it("keeps the Orders page's chip classes, unselected and selected", () => {
        const chip = renderDialog();
        expect(chip.className).toBe(`${CHIP_BASE} bg-background border-[var(--card-border)] text-foreground hover:border-red-400 hover:text-red-600`);
        expect(chip.hasAttribute("aria-pressed")).toBe(false);
        fireEvent.click(chip);
        expect(chip.className).toBe(`${CHIP_BASE} bg-red-600 text-white border-red-600`);
        expect(screen.getByText("orders.blacklist.required").className).toBe("text-red-500");
        expect(screen.getByRole("button", { name: "orders.blacklist.blockCustomer" }).className)
            .toBe("w-full bg-red-600 hover:bg-red-700 text-white rounded-xl h-10 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed");
    });

    it("gives the customers variant's chosen reason the Block button's crimson", () => {
        const chip = renderDialog("customers");
        expect(chip.getAttribute("aria-pressed")).toBe("false");
        expect(chip.className).not.toMatch(/\bred-/);
        fireEvent.click(chip);
        expect(chip.getAttribute("aria-pressed")).toBe("true");
        expect(chip.className).toContain("bg-rose-700");
        expect(chip.className).toContain("border-rose-700");
        expect(chip.className).not.toMatch(/\bred-/);
        // The same fill as the action it enables: one danger red in the dialog.
        const block = screen.getByRole("button", { name: "orders.blacklist.blockCustomer" });
        expect(block.className).toContain("bg-rose-700");
        expect(screen.getByText("orders.blacklist.required").className).not.toMatch(/\bred-/);
    });
});

describe("BlacklistDialog reason label and placeholders", () => {
    it("keeps the Orders page's label markup and placeholders", () => {
        fireEvent.click(renderDialog());
        const star = screen.getByText("orders.blacklist.required");
        // The label holds the text and the star directly, with no direction run.
        expect(star.parentElement?.tagName).toBe("LABEL");
        expect(star.parentElement?.hasAttribute("dir")).toBe(false);
        expect(screen.getByPlaceholderText("orders.blacklist.anyDetails")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "orders.blacklist.reasonPreset.other" }));
        expect(screen.getByPlaceholderText("orders.blacklist.writeReason")).toBeTruthy();
    });

    it("puts the customers variant's star in the label's own direction run and uses its own placeholders", () => {
        fireEvent.click(renderDialog("customers"));
        const run = screen.getByText("orders.blacklist.required").parentElement;
        expect(run?.getAttribute("dir")).toBe("auto");
        expect(run?.textContent).toBe("orders.blacklist.reason orders.blacklist.required");
        expect(screen.getByPlaceholderText("customers.block.anyDetails")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "orders.blacklist.reasonPreset.other" }));
        expect(screen.getByPlaceholderText("customers.block.writeReason")).toBeTruthy();
    });
});
