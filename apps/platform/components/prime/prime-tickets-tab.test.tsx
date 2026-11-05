// The store's tickets with Prime: open and closed apart, who wrote last in
// the one on screen, and a new ticket started from an order's number.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PrimeTicketMessageView, PrimeTicketView } from "@/hooks/use-prime-tickets";
import { translations } from "@/lib/i18n";

const t = (key: string, vars?: Record<string, string | number>) => {
    const template = translations.en[key] ?? key;
    return vars ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : template;
};

vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t, language: "en" }), useTextDir: () => "ltr" }));
vi.mock("next/link", () => ({ default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));

const chats = vi.hoisted(() => ({ byId: new Map<number, { open: boolean; messages: PrimeTicketMessageView[] }>() }));
const find = vi.fn();
vi.mock("@/hooks/use-prime-tickets", () => ({
    usePrimeTickets: () => ({}),
    usePrimeTicketChat: (id: number) => ({ isPending: false, isError: false, data: chats.byId.get(id) ?? null, refetch: vi.fn() }),
    usePrimeTicketWrite: () => vi.fn(),
    usePrimeFindParcel: () => find,
}));

import { PrimeTicketsTab } from "./prime-tickets-tab";

const ticket = (ticketId: number, open: boolean, over: Partial<PrimeTicketView> = {}): PrimeTicketView => ({
    ticketId,
    caseId: 122910000 + ticketId,
    orderId: `order-${ticketId}`,
    orderNumber: `42611030${ticketId}`,
    customerName: `Customer ${ticketId}`,
    subject: "Different fee",
    open,
    latestMessage: "Checked, the right fee is 5,000.",
    at: "2026-11-04T06:14:00Z",
    ...over,
});
const message = (fromPrime: boolean, text: string): PrimeTicketMessageView => ({ id: null, text, at: null, sender: null, fromPrime, mediaUrl: null });

const TICKETS = [ticket(1, true), ticket(2, true, { subject: "Stuck parcel" }), ticket(3, false, { subject: "Change address" })];
const query = { isPending: false, isError: false, data: { success: true as const, connected: true as const, tickets: TICKETS, subjects: [] } };

const renderTab = (onNew = vi.fn()) => render(<PrimeTicketsTab tickets={query} newFor={null} onNew={onNew} onNewDone={vi.fn()} />);

describe("PrimeTicketsTab", () => {
    afterEach(() => {
        cleanup();
        chats.byId.clear();
        find.mockReset();
    });

    it("lists open tickets first and keeps the closed ones apart", () => {
        renderTab();
        const list = screen.getByRole("navigation", { name: "Tickets" });

        expect(within(list).getByRole("tab", { name: /Open\s*2/ }).getAttribute("aria-selected")).toBe("true");
        expect(within(list).getByText("Customer 1")).toBeTruthy();
        expect(within(list).getByText("Customer 2")).toBeTruthy();
        expect(within(list).queryByText("Customer 3")).toBeNull();

        fireEvent.click(within(list).getByRole("tab", { name: /Closed\s*1/ }));
        expect(within(list).getByText("Customer 3")).toBeTruthy();
        expect(within(list).queryByText("Customer 1")).toBeNull();
    });

    it("heads the chat with its order and parcel, says Prime answered, and opens the order", () => {
        chats.byId.set(1, { open: true, messages: [message(false, "The fee is 5,500."), message(true, "Checked, the right fee is 5,000.")] });
        renderTab();
        const chat = screen.getByRole("heading", { name: "Different fee" }).closest("section");
        if (!chat) throw new Error("no chat");

        expect(chat.textContent).toContain("Customer 1 · 426110301 · Prime parcel 122910001 · #1");
        expect(within(chat).getByText("Prime replied")).toBeTruthy();
        expect(within(chat).getByRole("link", { name: "Open the order" }).getAttribute("href")).toBe("/orders?order=order-1");
    });

    it("says the store is waiting when its own message is the last", () => {
        chats.byId.set(2, { open: true, messages: [message(false, "Stuck for 5 days.")] });
        renderTab();
        fireEvent.click(screen.getByText("Customer 2"));

        expect(screen.getByText("Waiting for Prime")).toBeTruthy();
    });

    it("starts a new ticket on the order found by its number", async () => {
        const onNew = vi.fn();
        find.mockResolvedValueOnce(null).mockResolvedValueOnce({ orderId: "order-9", label: "Zainab · 4261103099" });
        renderTab(onNew);

        fireEvent.click(screen.getByRole("button", { name: "New ticket" }));
        fireEvent.change(screen.getByLabelText("Order number"), { target: { value: " 4261103000 " } });
        fireEvent.click(screen.getByRole("button", { name: "Find" }));
        expect(await screen.findByText("No parcel went to Prime with this order number.")).toBeTruthy();
        expect(find).toHaveBeenLastCalledWith("4261103000");

        fireEvent.change(screen.getByLabelText("Order number"), { target: { value: "4261103099" } });
        fireEvent.click(screen.getByRole("button", { name: "Find" }));
        await waitFor(() => expect(onNew).toHaveBeenCalledWith("order-9", "Zainab · 4261103099"));
        expect(screen.queryByLabelText("Order number")).toBeNull();
    });

    it("fills the new ticket's message with a ready text for the store to edit", () => {
        render(<PrimeTicketsTab tickets={query} newFor={{ orderId: "o1", order: null, label: "Zainab · 4261103099" }} onNew={vi.fn()} onNewDone={vi.fn()} />);
        fireEvent.click(document.querySelector('[data-ticket-text="postponed"]') as HTMLElement);
        const message = screen.getByLabelText("Message") as HTMLTextAreaElement;
        expect(message.value).toContain("Please deliver it tomorrow");
        expect(message.value).toContain("Zainab · 4261103099");
    });
});
