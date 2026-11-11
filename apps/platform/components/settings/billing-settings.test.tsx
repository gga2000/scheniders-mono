/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { PlanLimitsData, SubscriptionData, WalletTransaction } from "@/hooks/use-billing";
import type { TenantSummary } from "@/hooks/use-tenant";
import type { TopupPaymentDetails, TopupRequest } from "@/hooks/use-wallet-topup";
import { hasRoomForTopup, receiptProblem } from "@/hooks/use-wallet-topup";

const state: {
    tenant: TenantSummary;
    balance: number;
    transactions: WalletTransaction[];
    trialOrders: number;
    payment: TopupPaymentDetails;
    requests: TopupRequest[];
} = {} as never;

const PLAN: PlanLimitsData = {
    plan: "starter",
    max_orders_per_month: -1,
    max_team_members: -1,
    order_price_iqd: 55,
    overage_price_iqd: 0,
    base_price_iqd: 9000,
    trial_days: 7,
    trial_order_cap: 50,
    whatsapp_message_price_iqd: 30,
    whatsapp_marketing_price_iqd: 80,
    features: {},
};

const SUB: SubscriptionData = {
    id: "s1",
    plan: "starter",
    status: "active",
    current_period_start: "2026-11-01T00:00:00Z",
    current_period_end: "2026-12-01T00:00:00Z",
    cancel_at: null,
    cancelled_at: null,
    pending_plan: null,
    plan_change_at: null,
};

vi.mock("@/hooks/use-tenant", () => ({
    useTenant: () => ({ data: state.tenant, isLoading: false }),
}));

vi.mock("@/hooks/use-billing", () => ({
    useBilling: () => ({
        wallet: { balance_iqd: state.balance, threshold_iqd: 5000, total_charged_iqd: 0, total_topped_up_iqd: 0 },
        subscription: SUB,
        allPlans: [PLAN],
        transactions: state.transactions,
        isLoading: false,
        refetch: () => undefined,
    }),
    useTrialOrderCount: (enabled: boolean) => ({ data: enabled ? state.trialOrders : undefined }),
}));

vi.mock("@/hooks/use-wallet-topup", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/hooks/use-wallet-topup")>();
    return {
        ...real,
        useWalletTopup: () => ({
            paymentDetails: state.payment,
            paymentDetailsLoading: false,
            requests: state.requests,
            submit: { isPending: false, mutate: vi.fn() },
        }),
    };
});

const { BillingSettings } = await import("./billing-settings");

function tenant(status: string, trialEndsAt: string | null): TenantSummary {
    return { id: "t1", status, trial_ends_at: trialEndsAt, plan: "starter", restrictions: null, display_id: 1 };
}

function tx(partial: Partial<WalletTransaction>): WalletTransaction {
    return {
        id: Math.random().toString(36),
        type: "charge",
        amount_iqd: -55,
        balance_after_iqd: 1000,
        description: null,
        payment_method: null,
        reference_id: null,
        created_at: "2026-11-09T10:00:00Z",
        ...partial,
    };
}

function show() {
    return render(<LanguageProvider><BillingSettings /></LanguageProvider>);
}

beforeEach(() => {
    state.tenant = tenant("active", null);
    state.balance = 20_000;
    state.transactions = [];
    state.trialOrders = 0;
    state.payment = { zain_cash: "07701234567", qi_card: null };
    state.requests = [];
});
afterEach(cleanup);

describe("BillingSettings", () => {
    it("trial: shows days and orders left, and no low-balance warning on an empty wallet", () => {
        state.tenant = tenant("trial", new Date(Date.now() + 3.5 * 86_400_000).toISOString());
        state.balance = 0;
        state.trialOrders = 12;
        show();
        const card = screen.getByTestId("billing-plan-card").textContent ?? "";
        expect(card).toContain("تجربة مجانية");
        expect(card).toContain("باقي 4 أيام");
        expect(card).toContain("12 من 50 طلب");
        expect(screen.queryByTestId("low-balance-warning")).toBeNull();
    });

    it("after the trial: low balance is warned and the next renewal is shown", () => {
        state.balance = 3000;
        show();
        expect(screen.getByTestId("low-balance-warning")).toBeTruthy();
        expect(screen.getByTestId("billing-plan-card").textContent).toContain("التجديد القادم");
    });

    it("wallet history reads in Arabic", () => {
        state.transactions = [
            tx({ description: "Delivered order 4370" }),
            tx({ description: "WhatsApp message 4371", amount_iqd: -50 }),
            tx({ description: "WhatsApp confirmation 4372", amount_iqd: -30 }),
            tx({ description: "WhatsApp offer 4373", amount_iqd: -80 }),
            tx({ description: "Monthly subscription - starter plan", amount_iqd: -9000 }),
            tx({ type: "topup", amount_iqd: 25_000, payment_method: "zain_cash", description: "Top-up by Zain Cash" }),
        ];
        show();
        expect(screen.getByText("طلب مُسلَّم #4370")).toBeTruthy();
        expect(screen.getByText("رسالة واتساب، طلب #4371")).toBeTruthy();
        expect(screen.getByText("واتساب تأكيد، طلب #4372")).toBeTruthy();
        expect(screen.getByText("واتساب تذكير أو عرض، طلب #4373")).toBeTruthy();
        expect(screen.getByText("الاشتراك الشهري")).toBeTruthy();
        expect(screen.getByText("شحن · زين كاش")).toBeTruthy();
    });

    it("top-up form shows our number, and says so when the number is not set", () => {
        show();
        fireEvent.click(screen.getByText("شحن المحفظة"));
        expect(screen.getByTestId("topup-number").textContent).toBe("07701234567");
        fireEvent.click(screen.getByText("كي كارد"));
        expect(screen.getByText("رقم الدفع غير متوفر بعد. تواصل مع الدعم.")).toBeTruthy();
        expect((screen.getByText("إرسال للمراجعة").closest("button") as HTMLButtonElement).disabled).toBe(true);
    });

    it("lists the shop's receipts with their state", () => {
        state.requests = [
            { id: "r1", amount_iqd: 50_000, method: "qi_card", created_at: "2026-11-09T10:00:00Z", decided_at: null, outcome: null },
            { id: "r2", amount_iqd: 25_000, method: "zain_cash", created_at: "2026-11-08T10:00:00Z", decided_at: "2026-11-08T11:00:00Z", outcome: "approved" },
        ];
        show();
        const list = screen.getByTestId("topup-requests").textContent ?? "";
        expect(list).toContain("قيد المراجعة");
        expect(list).toContain("أُضيف");
    });
});

describe("receiptProblem", () => {
    it("allows at most 3 receipts waiting for review", () => {
        const waiting = { outcome: null };
        const done = { outcome: "approved" as const };
        expect(hasRoomForTopup([waiting, waiting, done, done])).toBe(true);
        expect(hasRoomForTopup([waiting, waiting, waiting, done])).toBe(false);
    });

    it("takes photos and PDFs up to 5 MB only", () => {
        expect(receiptProblem({ type: "image/jpeg", size: 1000 })).toBeNull();
        expect(receiptProblem({ type: "application/pdf", size: 5 * 1024 * 1024 })).toBeNull();
        expect(receiptProblem({ type: "image/png", size: 5 * 1024 * 1024 + 1 })).toBe("size");
        expect(receiptProblem({ type: "image/gif", size: 10 })).toBe("type");
    });
});
