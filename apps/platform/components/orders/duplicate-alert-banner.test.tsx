/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render as rtlRender, screen, cleanup, fireEvent } from "@testing-library/react";
import type { ReactElement } from "react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { Order } from "@/types/order";
import { buildDuplicateWindowIndex } from "@/lib/duplicate-window";
import { DuplicateAlertBanner } from "./duplicate-alert-banner";

// Through the real provider, so the Arabic these assert is what the dictionary
// actually holds rather than a copy of it in the test. The provider defaults to
// Arabic, which is the language merchants run the orders page in.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: LanguageProvider });

afterEach(cleanup);

const BASE = "2026-09-11T07:00:00.000Z";

function order(overrides: Partial<Order> & { id: string }): Order {
    return {
        created_at: BASE,
        order_id: overrides.id,
        customer_name: "علي-تيست",
        phone: "07801234567",
        items: [{ name: "عطر فولاريس", quantity: 1, price: 43000 }],
        price: 43000,
        status: "new",
        priority: "normal",
        payment_status: "cod",
        is_return: false,
        is_replacement: false,
        is_archived: false,
        ...overrides,
    } as Order;
}

/** Mirrors how the page derives the alert, so the test exercises the real index. */
function alertFor(subject: Order, others: Order[]) {
    const alert = buildDuplicateWindowIndex([subject, ...others]).get(subject.id);
    if (!alert) throw new Error("expected an alert for the subject order");
    return alert;
}

describe("DuplicateAlertBanner", () => {
    it("marks the critical pairing and names the committed twin", () => {
        const subject = order({ id: "3260911002", status: "confirmed" });
        const twin = order({ id: "3260911001", status: "confirmed" });

        const { container } = render(
            <DuplicateAlertBanner alert={alertFor(subject, [twin])} order={subject} />,
        );

        expect(container.querySelector('[data-duplicate-severity="critical"]')).toBeTruthy();
        expect(screen.getByText("طلب مكرر ومؤكد مرتين")).toBeTruthy();
        expect(screen.getByText("#3260911001")).toBeTruthy();
        expect(screen.getByText("مؤكد")).toBeTruthy();
    });

    it("falls back to the warning skin when only one side is committed", () => {
        const subject = order({ id: "a", status: "new" });
        const twin = order({ id: "b", status: "confirmed" });

        const { container } = render(
            <DuplicateAlertBanner alert={alertFor(subject, [twin])} order={subject} />,
        );

        expect(container.querySelector('[data-duplicate-severity="warning"]')).toBeTruthy();
        expect(screen.getByText("طلب مكرر خلال 48 ساعة")).toBeTruthy();
    });

    it("states a same-day gap in minutes", () => {
        const subject = order({ id: "a" });
        const twin = order({ id: "b", created_at: "2026-09-11T07:12:00.000Z" });

        render(<DuplicateAlertBanner alert={alertFor(subject, [twin])} order={subject} />);

        expect(screen.getByText("نفس اليوم · بفارق 12 دقيقة")).toBeTruthy();
    });

    it("counts the extra twins beyond the one it names", () => {
        const subject = order({ id: "a" });
        const twins = [
            order({ id: "b", created_at: "2026-09-11T08:00:00.000Z" }),
            order({ id: "c", created_at: "2026-09-11T09:00:00.000Z" }),
        ];

        render(<DuplicateAlertBanner alert={alertFor(subject, twins)} order={subject} />);

        expect(screen.getByText("+1 طلب آخر")).toBeTruthy();
    });

    it("routes the actions without bubbling to the card beneath", () => {
        const subject = order({ id: "a" });
        const twin = order({ id: "b" });
        const onCompare = vi.fn();
        const onCancel = vi.fn();
        const onCardClick = vi.fn();

        render(
            <div onClick={onCardClick}>
                <DuplicateAlertBanner
                    alert={alertFor(subject, [twin])}
                    order={subject}
                    onCompare={onCompare}
                    onCancel={onCancel}
                />
            </div>,
        );

        fireEvent.click(screen.getByText("قارن"));
        fireEvent.click(screen.getByText("إلغاء"));

        expect(onCompare).toHaveBeenCalledWith(subject);
        expect(onCancel).toHaveBeenCalledWith(subject);
        expect(onCardClick).not.toHaveBeenCalled();
    });

    it("collapses to a single chip in compact mode", () => {
        const subject = order({ id: "a" });
        const twin = order({ id: "b" });

        render(<DuplicateAlertBanner alert={alertFor(subject, [twin])} order={subject} compact />);

        expect(screen.getByText("مكرر")).toBeTruthy();
        expect(screen.queryByText("قارن")).toBeNull();
    });
});

describe("DuplicateAlertBanner cross-number matches", () => {
    it("names the shared number when the match is not on the primary", () => {
        const subject = order({ id: "a", order_id: "3260911003", phone: "07811262261", secondary_phone: "07801234567" });
        const twin = order({ id: "b", order_id: "3260911004", phone: "07801234567", secondary_phone: "07811262261" });

        render(<DuplicateAlertBanner alert={alertFor(subject, [twin])} order={subject} />);

        expect(screen.getByText("عبر الرقم")).toBeTruthy();
    });

    it("stays quiet about the number when both orders share a primary", () => {
        const subject = order({ id: "a" });
        const twin = order({ id: "b" });

        render(<DuplicateAlertBanner alert={alertFor(subject, [twin])} order={subject} />);

        expect(screen.queryByText("عبر الرقم")).toBeNull();
    });
});

describe("DuplicateAlertBanner in English", () => {
    afterEach(() => localStorage.removeItem("schneiders_language"));

    it("speaks the merchant's chosen language, not hardcoded Arabic", () => {
        // On its original branch this banner was inline Arabic, which matched an
        // order card that was not translated either. Main translated the card, so
        // an English-language merchant would have read one Arabic banner on an
        // otherwise English page.
        localStorage.setItem("schneiders_language", "en");
        const subject = order({ id: "3260911002", status: "confirmed" });
        const twin = order({ id: "3260911001", status: "confirmed" });

        render(<DuplicateAlertBanner alert={alertFor(subject, [twin])} order={subject} />);

        expect(screen.getByText("Duplicate order, confirmed twice")).toBeTruthy();
        expect(screen.queryByText("طلب مكرر ومؤكد مرتين")).toBeNull();
    });
});
