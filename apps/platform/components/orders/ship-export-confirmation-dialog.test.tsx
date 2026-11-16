/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import type { Order } from "@/types/order";
import { LanguageProvider } from "@/components/providers/language-provider";
import { GENERAL_LAYOUT, type SavedLayout } from "@/lib/shipping/export-columns";
import type { SentBefore } from "@/hooks/use-shipping-export";
import { ShipExportConfirmationDialog } from "./ship-export-confirmation-dialog";

const h = vi.hoisted(() => ({
    sent: new Map<string, { sentAt: string | null; courier: string | null }>(),
    saved: [] as unknown[],
    saveMutate: vi.fn(),
}));

vi.mock("@/hooks/use-shipping-export", () => ({
    useSavedLayouts: () => ({ data: h.saved, isLoading: false, isPending: false }),
    useSentBefore: () => ({ data: h.sent, isLoading: false, isError: false }),
    useSaveLayout: () => ({ mutate: h.saveMutate, isPending: false }),
    useDeleteLayout: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => ({ tenantId: "t1" }) }));

afterEach(cleanup);

// 12:00 Baghdad on 7 Sep 2026.
const NOW = new Date("2026-09-07T09:00:00.000Z");

const order = (id: string, scheduled_date: string | null, extra: Partial<Order> = {}) =>
    ({ id, order_id: id, customer_name: `C${id}`, status: "confirmed", governorate_code: "BGD", scheduled_date, ...extra }) as unknown as Order;

// 101 ships today, 102 is due today, 103 is postponed to the 9th.
const orders = [order("101", null), order("102", "2026-09-07"), order("103", "2026-09-09")];

const renderDialog = (props: { orders?: Order[]; getDispatchTwin?: (id: string) => Order | undefined } = {}) => {
    const onConfirmExport = vi.fn();
    render(
        <LanguageProvider>
            <ShipExportConfirmationDialog
                open
                onOpenChange={() => {}}
                orders={props.orders ?? orders}
                currentTab="confirmed"
                hasSelection
                onConfirmExport={onConfirmExport}
                getDispatchTwin={props.getDispatchTwin}
            />
        </LanguageProvider>,
    );
    return { onConfirmExport };
};

// One tick per act, so the countdown effect re-arms between seconds.
const waitOutCountdown = () => {
    for (let i = 0; i < 6; i++) act(() => { vi.advanceTimersByTime(1000); });
};

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    h.sent = new Map();
    h.saved = [];
    h.saveMutate.mockReset();
    localStorage.clear();
});
afterEach(() => vi.useRealTimers());

describe("ship export — orders scheduled for a later day", () => {
    it("warns about them and leaves them out by default", () => {
        const { onConfirmExport } = renderDialog();
        expect(screen.getByText("طلب واحد موعده يوم ثاني")).toBeTruthy();
        waitOutCountdown();

        // The order due today ships; only the one for the 9th is held back.
        fireEvent.click(screen.getByRole("button", { name: /صدّر طلبين/ }));
        expect(onConfirmExport).toHaveBeenCalledWith({
            target: { kind: "prime" },
            includeScheduledLater: false,
            skipIds: [],
        });
    });

    it("ships them only when the merchant explicitly opts in", () => {
        const { onConfirmExport } = renderDialog();
        fireEvent.click(screen.getByRole("checkbox", { name: /اشحنها اليوم/ }));
        waitOutCountdown();

        fireEvent.click(screen.getByRole("button", { name: /صدّر 3 طلبات/ }));
        expect(onConfirmExport).toHaveBeenCalledWith(expect.objectContaining({ includeScheduledLater: true }));
    });
});

describe("ship export — orders that already went to a courier", () => {
    it("asks before sending them again and leaves them out unless the merchant ticks it", () => {
        h.sent = new Map<string, SentBefore>([["101", { sentAt: "2026-09-05T08:00:00Z", courier: "كويك" }]]);
        const { onConfirmExport } = renderDialog();
        const block = screen.getByTestId("ship-export-sent-before");
        expect(block.textContent).toContain("طلب واحد انرسل قبل. نصدّره مرة ثانية؟");
        expect(block.textContent).toContain("#101 · كويك");
        waitOutCountdown();

        fireEvent.click(screen.getByRole("button", { name: /صدّر طلب واحد/ }));
        expect(onConfirmExport).toHaveBeenLastCalledWith(expect.objectContaining({ skipIds: ["101"] }));
    });

    it("sends them again when ticked", () => {
        h.sent = new Map<string, SentBefore>([["101", { sentAt: "2026-09-05T08:00:00Z", courier: "Prime" }]]);
        const { onConfirmExport } = renderDialog();
        fireEvent.click(screen.getByRole("checkbox", { name: /صدّرها مرة ثانية/ }));
        waitOutCountdown();

        fireEvent.click(screen.getByRole("button", { name: /صدّر طلبين/ }));
        expect(onConfirmExport).toHaveBeenLastCalledWith(expect.objectContaining({ skipIds: [] }));
    });

    it("says nothing when none went out", () => {
        renderDialog();
        expect(screen.queryByTestId("ship-export-sent-before")).toBeNull();
    });
});

describe("ship export — the courier", () => {
    it("another courier needs a name, then exports every column under that name", () => {
        const { onConfirmExport } = renderDialog();
        fireEvent.click(screen.getByRole("radio", { name: /شركة ثانية/ }));
        expect(screen.getByTestId("ship-export-layout-editor")).toBeTruthy();
        expect(screen.getByTestId("ship-export-layout-issue").textContent).toBe("اكتب اسم شركة التوصيل أولاً.");
        waitOutCountdown();
        expect((screen.getByRole("button", { name: /صدّر طلبين/ }) as HTMLButtonElement).disabled).toBe(true);

        fireEvent.change(screen.getByPlaceholderText("مثلاً: توصيل النجم"), { target: { value: " كويك " } });
        fireEvent.click(screen.getByRole("button", { name: /صدّر طلبين/ }));
        expect(onConfirmExport).toHaveBeenCalledWith({
            target: { kind: "layout", courierName: "كويك", layout: GENERAL_LAYOUT },
            includeScheduledLater: false,
            skipIds: [],
        });
        expect(localStorage.getItem("fermi.shipExport.courier.t1")).toBe("other");
    });

    it("saves the layout as the merchant's courier", () => {
        renderDialog();
        fireEvent.click(screen.getByRole("radio", { name: /شركة ثانية/ }));
        fireEvent.change(screen.getByPlaceholderText("مثلاً: توصيل النجم"), { target: { value: "كويك" } });
        fireEvent.click(screen.getByRole("radio", { name: /بدون الـ 0/ }));
        fireEvent.click(screen.getByRole("button", { name: /احفظها كشركتي/ }));
        expect(h.saveMutate).toHaveBeenCalledWith(
            { id: undefined, name: "كويك", layout: { ...GENERAL_LAYOUT, phoneFormat: "bare" } },
            expect.anything(),
        );
    });

    it("opens on the saved courier picked last time and exports in its layout", () => {
        const layout = { columns: [{ key: "phone" as const, header: "الهاتف" }], phoneFormat: "intl" as const, fileFormat: "csv" as const };
        h.saved = [{ id: "s1", name: "النجم", layout } satisfies SavedLayout];
        localStorage.setItem("fermi.shipExport.courier.t1", "saved:s1");
        const { onConfirmExport } = renderDialog();
        expect(screen.getByRole("radio", { name: "النجم" }).getAttribute("aria-checked")).toBe("true");
        waitOutCountdown();

        fireEvent.click(screen.getByRole("button", { name: /صدّر طلبين/ }));
        expect(onConfirmExport).toHaveBeenCalledWith(expect.objectContaining({
            target: { kind: "layout", courierName: "النجم", layout },
        }));
    });

    it("falls back to Prime when the remembered courier was deleted", () => {
        localStorage.setItem("fermi.shipExport.courier.t1", "saved:gone");
        renderDialog();
        expect(screen.getByRole("radio", { name: "برايم" }).getAttribute("aria-checked")).toBe("true");
    });
});

describe("ship export — no governorate", () => {
    it("flags the order and still exports it", () => {
        const lost = order("104", null, { governorate_code: undefined, city: "", address_details: "قرب السوق" });
        const { onConfirmExport } = renderDialog({ orders: [order("101", null), lost] });
        expect(screen.getByTestId("ship-export-no-governorate").textContent).toContain("#104");
        waitOutCountdown();
        fireEvent.click(screen.getByRole("button", { name: /صدّر طلبين/ }));
        expect(onConfirmExport).toHaveBeenCalled();
    });
});

describe("ship export — 48h duplicate dispatch warning", () => {
    const twin = { id: "t", order_id: "3261004001", status: "in_transit" } as unknown as Order;
    const withTwins = (twinFor: Record<string, Order>) => renderDialog({ getDispatchTwin: (id) => twinFor[id] });

    it("names each order that would send a second courier to its customer", () => {
        withTwins({ "101": twin });
        const warning = screen.getByTestId("ship-export-duplicate-warning");
        expect(warning.textContent).toContain("#101 ↔ #3261004001");
        expect(warning.textContent).toContain("قيد التوصيل");
    });

    it("ignores a twin on an order this export leaves home", () => {
        // 103 is scheduled for a later day, so it is not shipped by default.
        withTwins({ "103": twin });
        expect(screen.queryByTestId("ship-export-duplicate-warning")).toBeNull();

        fireEvent.click(screen.getByRole("checkbox", { name: /اشحنها اليوم/ }));
        expect(screen.getByTestId("ship-export-duplicate-warning")).toBeTruthy();
    });

    it("ignores a twin on an order already sent and left out", () => {
        h.sent = new Map<string, SentBefore>([["101", { sentAt: null, courier: null }]]);
        withTwins({ "101": twin });
        expect(screen.queryByTestId("ship-export-duplicate-warning")).toBeNull();
    });

    it("stays silent without duplicates", () => {
        withTwins({});
        expect(screen.queryByTestId("ship-export-duplicate-warning")).toBeNull();
    });
});
