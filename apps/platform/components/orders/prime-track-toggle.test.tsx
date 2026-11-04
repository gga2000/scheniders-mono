// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useOrderStore } from "@/store/use-order-store";
import { PrimeTrackToggle } from "./prime-track-toggle";

const link = { connected: true, branchName: null, checked: true };
vi.mock("@/hooks/use-prime-link", () => ({ usePrimeConnection: () => link }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (key: string) => key }) }));

afterEach(() => {
    cleanup();
    link.connected = true;
    useOrderStore.getState().setPrimeTrackOnCards(true);
});

describe("PrimeTrackToggle", () => {
    it("hides and shows the Prime strip on every card", () => {
        render(<PrimeTrackToggle />);
        const button = screen.getByRole("button", { name: "orders.prime.trackToggle.hide" });
        expect(button.getAttribute("aria-pressed")).toBe("true");
        fireEvent.click(button);
        expect(useOrderStore.getState().primeTrackOnCards).toBe(false);
        expect(screen.getByRole("button", { name: "orders.prime.trackToggle.show" }).getAttribute("aria-pressed")).toBe("false");
    });

    it("is not there without a Prime link", () => {
        link.connected = false;
        render(<PrimeTrackToggle />);
        expect(screen.queryByRole("button")).toBeNull();
    });
});
