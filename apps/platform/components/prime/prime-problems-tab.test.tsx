// @vitest-environment jsdom
// The problems tab: each problem parcel with what Prime said, the fixes at
// hand, and a "handled" mark with a note.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PrimeBoardData, PrimeBoardOrder } from "@/hooks/use-prime-board";
import type { PrimeShipmentView } from "@/lib/prime/chip-state";
import type { PrimeBoard } from "@/lib/prime/board";
import { translations } from "@/lib/i18n";

const t = (key: string, vars?: Record<string, string | number>) => {
    const template = translations.en[key] ?? key;
    return vars ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : template;
};

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t, language: "en" }), useTextDir: () => "ltr" }));
const mark = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("@/hooks/use-prime-shipments", () => ({ usePrimeProblemMark: () => mark }));
const whatsapp = vi.hoisted(() => vi.fn());
vi.mock("@/lib/open-whatsapp-chat", () => ({ openWhatsAppChat: whatsapp }));
vi.mock("@/components/orders/card/prime-parcel-panel", () => ({ PrimeParcelPanel: () => <div data-testid="panel" /> }));

import { PrimeProblemsTab } from "./prime-problems-tab";

const NOW = Date.parse("2026-11-04T20:00:00Z");

const view = (over: Partial<PrimeShipmentView>): PrimeShipmentView => ({
    caseId: 52402395,
    status: "ONWAY",
    stepCode: "ONWAY",
    stepName: "مندوب التوصيل",
    sentAt: "2026-11-04T08:00:00Z",
    receiptAmountIqd: 40_000,
    shipmentCharge: 6_000,
    checkedAt: "2026-11-04T19:55:00Z",
    statusChangedAt: "2026-11-04T12:00:00Z",
    pending: false,
    pushError: null,
    cancelledAt: null,
    cancelRefusedAt: null,
    resentAt: null,
    returnReason: null,
    postponeReason: null,
    postponedTo: null,
    problemCheckedAt: null,
    problemCheckedBy: null,
    problemNote: null,
    ...over,
});

const order = (id: string, name: string): PrimeBoardOrder => ({
    id,
    order_id: `126110300${id.slice(-1)}`,
    customer_name: name,
    city: "الكوت",
    phone: "07701234567",
    status: "in_transit",
    price: 40_000,
    delivery_fee: undefined,
    discount_amount: undefined,
    payment_status: "cod",
    address_details: undefined,
});

function data(): PrimeBoardData {
    const views = new Map<string, PrimeShipmentView>([
        ["o1", view({ stepCode: "RTN_WITHAGENT", stepName: "تعذر التوصيل", returnReason: "الزبون لا يرد" })],
        ["o2", view({ status: "POSTPONED", stepCode: "POSTPONED", stepName: "مؤجل" })],
        ["o3", view({ stepCode: "RTN_WITHAGENT", problemCheckedAt: "2026-11-04T13:00:00Z", problemCheckedBy: "Noor", problemNote: "Home tomorrow" })],
        ["o4", view({})],
    ]);
    const orders = new Map([
        ["o1", order("o1", "حيدر")],
        ["o2", order("o2", "معتز")],
        ["o3", order("o3", "مريم")],
        ["o4", order("o4", "سارة")],
    ]);
    return { board: {} as PrimeBoard, views, orders, cash: new Map(), readAt: NOW };
}

afterEach(() => {
    cleanup();
    mark.mockClear();
    whatsapp.mockClear();
});

describe("PrimeProblemsTab", () => {
    it("lists the problem parcels with Prime's words, unhandled first", () => {
        render(<PrimeProblemsTab data={data()} onAskPrime={vi.fn()} />);
        const rows = document.querySelectorAll("[data-prime-problem]");
        expect([...rows].map((r) => r.getAttribute("data-prime-problem"))).toEqual(["o1", "o2", "o3"]);
        expect(within(rows[0] as HTMLElement).getByText(/Prime: الزبون لا يرد/)).toBeTruthy();
        expect(within(rows[2] as HTMLElement).getByText(/Handled by Noor/).textContent).toContain("Home tomorrow");
        expect(screen.getByText("Your work now").parentElement?.textContent).toContain("· 2");
    });

    it("says all is clear, with the last check and the oldest parcel on the road, when nothing needs anyone", () => {
        const calm: PrimeBoardData = { ...data(), views: new Map([["o4", view({})]]), orders: new Map([["o4", order("o4", "سارة")]]) };
        render(<PrimeProblemsTab data={calm} onAskPrime={vi.fn()} calm={{ checkedMinutesAgo: 3, oldest: { orderNumber: "1261103004", days: 2 } }} />);
        const quiet = document.querySelector("[data-prime-calm]");
        expect(quiet?.textContent).toContain("All clear");
        expect(quiet?.textContent).toContain("Last checked 3 min ago");
        expect(quiet?.textContent).toContain("oldest parcel on the road: 1261103004, 2 days");
        expect(document.querySelectorAll("[data-prime-problem]")).toHaveLength(0);
    });

    it("filters by kind", () => {
        render(<PrimeProblemsTab data={data()} onAskPrime={vi.fn()} />);
        fireEvent.click(document.querySelector('[data-problem-filter="postponed"]') as HTMLElement);
        expect([...document.querySelectorAll("[data-prime-problem]")].map((r) => r.getAttribute("data-prime-problem"))).toEqual(["o2"]);
    });

    it("calls, writes on WhatsApp and asks Prime from the row", () => {
        const ask = vi.fn();
        render(<PrimeProblemsTab data={data()} onAskPrime={ask} />);
        const row = document.querySelector('[data-prime-problem="o1"]') as HTMLElement;
        expect(within(row).getByText("Call").closest("a")?.getAttribute("href")).toBe("tel:07701234567");
        fireEvent.click(within(row).getByText("WhatsApp"));
        expect(whatsapp).toHaveBeenCalledWith("07701234567", expect.stringContaining("could not reach you"), t);
        expect(within(row).getByText("New attempt")).toBeTruthy();
        expect(within(row).queryByText("Ask Prime")).toBeNull();
        const postponed = document.querySelector('[data-prime-problem="o2"]') as HTMLElement;
        fireEvent.click(within(postponed).getByText("Ask Prime"));
        expect(ask).toHaveBeenCalledWith("o2");
    });

    it("marks a parcel handled with a note, and takes the mark off", async () => {
        render(<PrimeProblemsTab data={data()} onAskPrime={vi.fn()} />);
        const row = document.querySelector('[data-prime-problem="o1"]') as HTMLElement;
        fireEvent.click(within(row).getByText("Handled"));
        fireEvent.change(screen.getByPlaceholderText(/Called, customer/), { target: { value: "Will answer at 6" } });
        fireEvent.click(screen.getByText("Mark handled"));
        await waitFor(() => expect(mark).toHaveBeenCalledWith({ action: "handled", orderId: "o1", note: "Will answer at 6" }));

        const done = document.querySelector('[data-prime-problem="o3"]') as HTMLElement;
        fireEvent.click(within(done).getByText("Not handled"));
        await waitFor(() => expect(mark).toHaveBeenCalledWith({ action: "reopen", orderId: "o3" }));
    });
});
