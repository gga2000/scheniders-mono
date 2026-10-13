/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Order } from "@/types/order";
import { followUpState } from "@/lib/follow-up-state";
import { LanguageProvider } from "@/components/providers/language-provider";
import { FollowUpCueBadge } from "./follow-up-cue-badge";

afterEach(cleanup);

function order(overrides: Partial<Order> = {}): Order {
    return {
        id: "o1",
        order_id: "7353",
        customer_name: "Barik",
        phone: "07838140244",
        items: [],
        price: 34750,
        status: "contacted",
        priority: "normal",
        payment_status: "cod",
        created_at: "2026-09-11T00:00:00.000Z",
        is_return: false,
        is_replacement: false,
        is_archived: false,
        ...overrides,
    } as Order;
}

/** Goes through the real resolver so the test exercises the shipped rules. */
function renderCue(overrides: Partial<Order> = {}, due: "discount" | "reminder" = "discount") {
    const state = followUpState(order(overrides), {
        needsReminder: due === "reminder",
        needsDiscount: due === "discount",
    });
    if (!state) throw new Error("expected a follow-up to be due");
    return render(
        <LanguageProvider>
            <FollowUpCueBadge state={state} hoursSinceCreated={61} />
        </LanguageProvider>,
    );
}

describe("FollowUpCueBadge", () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.setSystemTime(new Date("2026-09-11T12:00:00.000Z"));
    });
    afterEach(() => vi.useRealTimers());

    it("nags with no face until someone sends it", () => {
        const { container } = renderCue();
        expect(screen.getByText("مرت 61 ساعة (خصم)")).toBeTruthy();
        expect(container.querySelector(".animate-pulse")).toBeTruthy();
        expect(container.querySelector('[data-followup-sent="false"]')).toBeTruthy();
    });

    it("shows the sender's avatar once the matching follow-up went out", () => {
        const { container } = renderCue({
            last_followup_type: "discount",
            last_followup_by_name: "علي",
            last_followup_by_avatar: "https://example.com/ali.png",
            last_followup_at: "2026-09-11T11:30:00.000Z",
        });

        const avatar = container.querySelector('img[alt="علي"]') as HTMLImageElement | null;
        expect(avatar?.src).toBe("https://example.com/ali.png");
        // Handled, so it stops shouting.
        expect(container.querySelector(".animate-pulse")).toBeNull();
    });

    it("names the sender and when they sent it in the tooltip", () => {
        const { container } = renderCue({
            last_followup_type: "discount",
            last_followup_by_name: "علي",
            last_followup_at: "2026-09-11T11:30:00.000Z",
        });
        expect(container.querySelector('[data-followup-kind="discount"]')?.getAttribute("title"))
            .toBe("أُرسل الخصم بواسطة علي · قبل 30 دقيقة");
    });

    it("falls back to an initial when the sender has no avatar", () => {
        renderCue({ last_followup_type: "discount", last_followup_by_name: "سارة" });
        expect(screen.getByText("س")).toBeTruthy();
    });

    it("keeps nagging when the follow-up that went out was a different kind", () => {
        // A reminder went out earlier; the order has since aged into needing a
        // discount, which nobody has sent. The cue stays loud — the work is still
        // owed — but the earlier sender is shown muted, because "this customer has
        // already heard from us" changes how the agent opens.
        const { container } = renderCue({
            last_followup_type: "reminder",
            last_followup_by_name: "علي",
            last_followup_by_avatar: "https://example.com/ali.png",
        });

        expect(container.querySelector(".animate-pulse")).toBeTruthy();
        expect(container.querySelector('[data-followup-sent="true"]')).toBeNull();

        const earlier = container.querySelector('[data-followup-earlier="true"]');
        expect(earlier).toBeTruthy();
        expect(earlier?.querySelector('img[alt="علي"]')).toBeTruthy();
        expect(container.querySelector('[data-followup-kind="discount"]')?.getAttribute("title"))
            .toContain("آخر تواصل: أُرسل التذكير بواسطة علي");
    });

    it("shows no earlier face when nobody has contacted the customer at all", () => {
        const { container } = renderCue({});
        expect(container.querySelector('[data-followup-earlier="true"]')).toBeNull();
        expect(container.querySelector(".animate-pulse")).toBeTruthy();
    });

    it("renders a bot glyph rather than crediting a person", () => {
        const { container } = renderCue({
            last_followup_type: "discount",
            last_followup_by_name: "الإرسال التلقائي",
            last_followup_by_avatar: "bot",
        });

        // The 'bot' sentinel must never reach an <img src>.
        expect(container.querySelector("img")).toBeNull();
        expect(screen.getByLabelText("الإرسال التلقائي")).toBeTruthy();
        expect(container.querySelector(".animate-pulse")).toBeNull();
    });

    it("labels the reminder variant when that is what is due", () => {
        renderCue({}, "reminder");
        expect(screen.getByText("مرت 61 ساعة (تذكير)")).toBeTruthy();
    });
});

describe("FollowUpCueBadge with nothing due", () => {
    beforeEach(() => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.setSystemTime(new Date("2026-09-11T12:00:00.000Z"));
    });
    afterEach(() => vi.useRealTimers());

    function renderContacted(overrides: Partial<Order>) {
        const state = followUpState(order(overrides), { needsReminder: false, needsDiscount: false });
        if (!state) throw new Error("expected a contact record");
        return render(
        <LanguageProvider>
            <FollowUpCueBadge state={state} hoursSinceCreated={61} />
        </LanguageProvider>,
    );
    }

    it("shows who made a manual contact, with no alarm text", () => {
        const { container } = renderContacted({
            last_followup_type: "manual",
            last_followup_by_name: "علي",
            last_followup_by_avatar: "https://example.com/ali.png",
            last_followup_at: "2026-09-11T11:00:00.000Z",
        });

        expect(container.querySelector('img[alt="علي"]')).toBeTruthy();
        expect(screen.getByText("قبل 1 ساعة")).toBeTruthy();
        // Not a cue: no hours-passed copy, no pulse.
        expect(screen.queryByText(/مرت 61 ساعة/)).toBeNull();
        expect(container.querySelector(".animate-pulse")).toBeNull();
    });

    it("names the kind of contact in the tooltip", () => {
        const { container } = renderContacted({
            last_followup_type: "manual",
            last_followup_by_name: "علي",
            last_followup_at: "2026-09-11T11:00:00.000Z",
        });
        expect(container.querySelector('[data-followup-kind="none"]')?.getAttribute("title"))
            .toBe("تم التواصل بواسطة علي · قبل 1 ساعة");
    });

    it("says confirmation when that is what went out", () => {
        const { container } = renderContacted({
            last_followup_type: "confirmation",
            last_followup_by_name: "سارة",
            last_followup_at: "2026-09-11T11:00:00.000Z",
        });
        expect(container.querySelector('[data-followup-kind="none"]')?.getAttribute("title"))
            .toContain("أُرسل التأكيد");
    });
});
