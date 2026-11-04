// One Prime payment against our books: differences first, each with its way
// to settle it, and the approval that closes the matching orders as paid.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PrimeStatementRowView } from "@/hooks/use-prime-statements";
import { translations } from "@/lib/i18n";

const t = (key: string, vars?: Record<string, string | number>) => {
    const template = translations.en[key] ?? key;
    return vars ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : template;
};

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t, language: "en" }), useTextDir: () => "ltr" }));

const mutateAsync = vi.fn();
const statement = vi.hoisted(() => ({ data: null as unknown }));
vi.mock("@/hooks/use-prime-statements", () => ({
    usePrimeStatement: () => ({ isPending: false, isError: false, data: statement.data }),
    usePrimeStatementAction: () => ({ mutateAsync, isPending: false }),
}));
const downloadCsv = vi.fn();
vi.mock("@/lib/export-utils", () => ({ downloadCsv: (...args: unknown[]) => downloadCsv(...args) }));

import { PrimePaymentDetail } from "./prime-payment-detail";

const row = (name: string, over: Partial<PrimeStatementRowView> = {}, ours: Partial<NonNullable<PrimeStatementRowView["ours"]>> = {}): PrimeStatementRowView => ({
    caseId: 1,
    receipt: name,
    ours: { orderId: `id-${name}`, orderNumber: name, customerName: name, collect: 36_750, fee: 5_000, status: "delivered", linked: true, ...ours },
    primeCollect: 36_750,
    primeFee: 5_000,
    primeNet: 31_750,
    diff: 0,
    kind: "match",
    ...over,
});

const ROWS = [
    row("Ali"),
    row("Sara", { primeCollect: 30_000, primeNet: 25_000, diff: -6_750, kind: "different" }),
    row("Duaa", { primeFee: 5_500, primeNet: 31_250, diff: -500, kind: "different" }),
    row("Zainab", {}, { status: "in_transit" }),
    { ...row("Stranger", { diff: null, kind: "unknown" }), ours: null },
];

function show(approval: { at: string; source: "app" | "pdf" } | null = null) {
    statement.data = {
        success: true,
        connected: true,
        statement: { rows: ROWS, summary: { parcels: 5, matched: 2, different: 2, unknown: 1, collect: 176_250, fees: 25_500, net: 150_750, diff: -7_250 } },
        approval,
    };
    const onAskPrime = vi.fn();
    render(<PrimePaymentDetail paymentId={88014} onAskPrime={onAskPrime} />);
    return { onAskPrime };
}

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe("PrimePaymentDetail", () => {
    it("puts the differences first and offers the fix that fits each", () => {
        const { onAskPrime } = show();
        const names = screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[0].textContent);
        // Name, then order number: differences, then parcels not ours, then matches.
        expect(names).toEqual(["SaraSara", "DuaaDuaa", "StrangerStranger", "AliAli", "ZainabZainab"]);

        // What we expect is the paid amount plus the shortfall.
        expect(screen.getByText("158,000")).toBeTruthy();
        expect(screen.getByText(/The difference is 7,250 IQD, in 2 parcels below\./)).toBeTruthy();

        const sara = screen.getAllByRole("row")[1];
        expect(within(sara).getByRole("button", { name: "Accept new price" })).toBeTruthy();

        const duaa = screen.getAllByRole("row")[2];
        fireEvent.click(within(duaa).getByRole("button", { name: "Ask Prime" }));
        expect(onAskPrime).toHaveBeenCalledWith("id-Duaa", "Payment 88014: the fee on this parcel is 5,500, we expected 5,000. Please check.", "Duaa · Duaa");

        expect(within(screen.getAllByRole("row")[3]).getByText("Not in your orders")).toBeTruthy();
    });

    it("approves only the matching orders that are delivered, after a confirm", async () => {
        mutateAsync.mockResolvedValue({ success: true, outcome: { kind: "approved", completed: 1 } });
        show();
        fireEvent.click(screen.getByRole("button", { name: "Approve 1 matching" }));
        expect(screen.getByText("Mark 1 orders as paid?")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Yes, approve" }));

        await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ action: "approve", id: 88014 }));
        expect(await screen.findByText("1 orders marked paid.")).toBeTruthy();
    });

    it("accepts Prime's price for one order and says a refused one plainly", async () => {
        mutateAsync.mockResolvedValue({ success: false, reason: "conflict" });
        show();
        fireEvent.click(screen.getByRole("button", { name: "Accept new price" }));
        await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ action: "accept_price", id: 88014, orderId: "id-Sara" }));
        expect((await screen.findByRole("alert")).textContent).toBe("This order just changed. Try again.");
    });

    it("shows a closed payment as closed, with no second approval", () => {
        show({ at: new Date().toISOString(), source: "pdf" });
        expect(screen.queryByRole("button", { name: /^Approve/ })).toBeNull();
        expect(screen.getByText(/Already entered from Prime's PDF/)).toBeTruthy();
    });

    it("exports every parcel with its numbers", () => {
        show();
        fireEvent.click(screen.getByRole("button", { name: "Export" }));
        const [headers, rows, filename] = downloadCsv.mock.calls[0] as [string[], (string | number)[][], string];
        expect(filename).toBe("prime-payment-88014");
        expect(headers[0]).toBe("Order");
        expect(rows[0]).toEqual(["Sara", "Sara", 1, 36_750, 30_000, 5_000, 25_000, -6_750, "Different"]);
    });
});
