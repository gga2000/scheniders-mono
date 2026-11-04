// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useOrderStore } from "@/store/use-order-store";
import type { PrimeCallCheck } from "@/lib/prime/call-check-load";
import { PrimeCallBand } from "./prime-call-band";
import type { OrderCardModel } from "./use-order-card-model";

const check: { data: PrimeCallCheck } = {
    data: {
        orderId: "o1",
        record: { parcels: 0, delivered: 0, returned: 0, moving: 0, recent: [], returnedInARow: 0 },
        send: { orderId: "o1", kind: "ready", fee: 5000, caseId: null },
    },
};
vi.mock("@/hooks/use-prime-link", () => ({ usePrimeConnection: () => ({ connected: true, branchName: null, checked: true }) }));
vi.mock("@/hooks/use-prime-call-check", () => ({
    PRIME_CALL_ORDER_STATUSES: new Set(["new", "contacted", "no_response"]),
    usePrimeCallCheck: () => check,
}));
vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (key: string) => key, language: "en" }),
    useTextDir: () => "ltr",
}));

const m = {
    order: { id: "o1", status: "contacted", version: 1, price: 34750, delivery_fee: 0, payment_status: "cod", shipping_address: { city: "Baghdad" } },
} as unknown as OrderCardModel;

afterEach(() => {
    cleanup();
    useOrderStore.getState().setPrimeTrackOnCards(true);
});

describe("PrimeCallBand", () => {
    it("shows under a card still on its call", () => {
        const { container } = render(<PrimeCallBand m={m} />);
        expect(container.querySelector("[data-prime-call]")).not.toBeNull();
    });

    it("hides when the tools-bar Prime strip switch is off", () => {
        useOrderStore.getState().setPrimeTrackOnCards(false);
        const { container } = render(<PrimeCallBand m={m} />);
        expect(container.querySelector("[data-prime-call]")).toBeNull();
    });
});
