/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import type { PlanLimitsData, SubscriptionData, WalletTransaction } from "@/hooks/use-billing";
import type { TenantSummary } from "@/hooks/use-tenant";
import type { TopupPaymentDetails, TopupRequest } from "@/hooks/use-wallet-topup";
import type { QiSavedCard } from "@/hooks/use-qi-topup";
import { hasRoomForTopup, receiptProblem } from "@/hooks/use-wallet-topup";
import type { BillingLock } from "@/hooks/use-billing-lock";
import type { AddonChangeResult, AddonKind, PlanChangeResult } from "@/hooks/use-plan-change";

const state: {
    tenant: TenantSummary;
    balance: number;
    transactions: WalletTransaction[];
    trialOrders: number;
    payment: TopupPaymentDetails;
    requests: TopupRequest[];
    qiEnabled: boolean;
    qiCanSaveCard: boolean;
    qiCard: QiSavedCard | null;
    sub: SubscriptionData;
    lock: BillingLock;
    addons: Record<AddonKind, number>;
    planQuote: PlanChangeResult | undefined;
    addonQuote: AddonChangeResult | undefined;
} = {} as never;

const SAVED_CARD: QiSavedCard = {
    masked_pan: "521372******8582",
    payment_system: null,
    valid_to: null,
    auto_refill: true,
    refill_amount_iqd: 25_000,
    refill_below_iqd: 5_000,
    failures: 0,
};

const PLAN: PlanLimitsData = {
    plan: "starter",
    max_orders_per_month: -1,
    max_team_members: 2,
    order_price_iqd: 55,
    overage_price_iqd: 0,
    base_price_iqd: 9000,
    trial_days: 7,
    trial_order_cap: 50,
    whatsapp_message_price_iqd: 30,
    whatsapp_marketing_price_iqd: 80,
    features: {},
    self_serve: true,
    sort_order: 1,
    recommended: false,
    max_stores: 1,
    extra_member_price_iqd: null,
    pos_branch_price_iqd: null,
    pos_branches_included: 0,
};

// The plans as plan_limits holds them after Fermi B1 (sort_order order).
const PLANS: PlanLimitsData[] = [
    PLAN,
    { ...PLAN, plan: "growth", base_price_iqd: 25_000, max_team_members: 6, sort_order: 2, recommended: true, extra_member_price_iqd: 5000, pos_branch_price_iqd: 15_000 },
    {
        ...PLAN,
        plan: "professional",
        base_price_iqd: 89_000,
        order_price_iqd: 40,
        max_team_members: 20,
        max_stores: 3,
        sort_order: 3,
        extra_member_price_iqd: 5000,
        pos_branch_price_iqd: 15_000,
        pos_branches_included: 1,
    },
    { ...PLAN, plan: "enterprise", base_price_iqd: 100_000, order_price_iqd: 100, max_team_members: -1, max_stores: -1, self_serve: false, sort_order: 4, pos_branches_included: -1 },
    { ...PLAN, plan: "internal", base_price_iqd: 0, order_price_iqd: 0, max_team_members: -1, max_stores: -1, self_serve: false, sort_order: 4, pos_branches_included: -1 },
];

const LOCK: BillingLock = {
    locked: false,
    reason: null,
    since: null,
    orders_left: null,
    allowance: 50,
    plan: "starter",
    price_iqd: 9000,
    balance_iqd: 20_000,
    can_pay: true,
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
        subscription: state.sub,
        allPlans: PLANS,
        transactions: state.transactions,
        isLoading: false,
        refetch: () => undefined,
    }),
    useTrialOrderCount: (enabled: boolean) => ({ data: enabled ? state.trialOrders : undefined }),
}));

vi.mock("@/hooks/use-billing-lock", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/hooks/use-billing-lock")>();
    return { ...real, useBillingLock: () => ({ data: state.lock }) };
});

const applyPlan = vi.fn();
const applyAddon = vi.fn();
const quotedPlans: (string | null)[] = [];
vi.mock("@/hooks/use-plan-change", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/hooks/use-plan-change")>();
    return {
        ...real,
        useTenantAddons: () => ({ data: state.addons }),
        usePlanQuote: (plan: string | null) => {
            quotedPlans.push(plan);
            return { data: plan ? state.planQuote : undefined, isLoading: false, isError: false };
        },
        useAddonQuote: () => ({ data: state.addonQuote, isLoading: false, isError: false }),
        useApplyPlanChange: () => ({ isPending: false, mutate: applyPlan }),
        useApplyAddonChange: () => ({ isPending: false, mutate: applyAddon }),
    };
});

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

const qiPay = vi.fn();
const qiCardUpdate = vi.fn();
const qiCardRemove = vi.fn();
vi.mock("@/hooks/use-qi-topup", async (importOriginal) => {
    const real = await importOriginal<typeof import("@/hooks/use-qi-topup")>();
    return {
        ...real,
        useQiTopup: () => ({ enabled: state.qiEnabled, canSaveCard: state.qiCanSaveCard, pay: { isPending: false, isSuccess: false, mutate: qiPay } }),
        useQiSavedCard: () => ({
            card: state.qiCard,
            refresh: vi.fn(),
            update: { isPending: false, mutate: qiCardUpdate },
            remove: { isPending: false, mutate: qiCardRemove },
        }),
    };
});

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(""),
    useRouter: () => ({ replace: vi.fn() }),
    usePathname: () => "/settings",
}));

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
    state.qiEnabled = false;
    state.qiCanSaveCard = true;
    state.qiCard = null;
    // A paid month that is still running whenever the tests run.
    state.sub = { ...SUB, current_period_end: new Date(Date.now() + 15 * 86_400_000).toISOString() };
    state.lock = { ...LOCK };
    state.addons = { extra_member: 0, pos_branch: 0 };
    state.planQuote = undefined;
    state.addonQuote = undefined;
    quotedPlans.length = 0;
    applyPlan.mockReset();
    applyAddon.mockReset();
    qiPay.mockReset();
    qiCardUpdate.mockReset();
    qiCardRemove.mockReset();
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

    it("an ended, unpaid trial says it ended instead of 'ends today'", () => {
        state.tenant = tenant("trial", new Date(Date.now() - 86_400_000).toISOString());
        show();
        const card = screen.getByTestId("billing-plan-card").textContent ?? "";
        expect(card).toContain("التجربة خلصت");
        expect(card).toContain("خلصت");
        expect(card).not.toContain("تنتهي اليوم");
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

    it("with Qi card payments on: Qi opens Qi's page with the amount, no receipt; Zain Cash keeps the receipt", () => {
        state.qiEnabled = true;
        show();
        fireEvent.click(screen.getByText("شحن المحفظة"));
        expect(screen.getByTestId("qi-pay")).toBeTruthy();
        expect(screen.queryByTestId("topup-file")).toBeNull();
        fireEvent.click(screen.getByTestId("qi-pay-button"));
        expect(qiPay).toHaveBeenCalledWith({ amount: 50_000, locale: "ar", saveCard: true }, expect.anything());
        fireEvent.click(screen.getByText("زين كاش"));
        expect(screen.queryByTestId("qi-pay")).toBeNull();
        expect(screen.getByTestId("topup-number").textContent).toBe("07701234567");
    });

    it("Qi pay offers to save the card for auto refill, and sends no save when switched off", () => {
        state.qiEnabled = true;
        show();
        fireEvent.click(screen.getByText("شحن المحفظة"));
        expect(screen.getByText("احفظ البطاقة للشحن التلقائي")).toBeTruthy();
        fireEvent.click(screen.getByTestId("qi-save-card").querySelector("button") as HTMLButtonElement);
        fireEvent.click(screen.getByTestId("qi-pay-button"));
        expect(qiPay).toHaveBeenCalledWith({ amount: 50_000, locale: "ar", saveCard: false }, expect.anything());
    });

    it("does not offer to save the card while card saving is not set up", () => {
        state.qiEnabled = true;
        state.qiCanSaveCard = false;
        show();
        fireEvent.click(screen.getByText("شحن المحفظة"));
        expect(screen.queryByTestId("qi-save-card")).toBeNull();
        fireEvent.click(screen.getByTestId("qi-pay-button"));
        expect(qiPay).toHaveBeenCalledWith({ amount: 50_000, locale: "ar", saveCard: false }, expect.anything());
    });

    it("names the saved card's brand when Qi told us", () => {
        state.qiEnabled = true;
        state.qiCard = { ...SAVED_CARD, payment_system: "MASTER_CARD" };
        show();
        expect(screen.getByTestId("qi-auto-refill").textContent).toContain("Mastercard تنتهي بـ 8582");
    });

    it("with a saved card: shows auto refill with the card ending, changes the amount, removes the card", () => {
        state.qiEnabled = true;
        state.qiCard = { ...SAVED_CARD };
        show();
        const panel = screen.getByTestId("qi-auto-refill");
        expect(panel.textContent).toContain("بطاقة تنتهي بـ 8582");
        expect(panel.textContent).toMatch(/نشحن IQD\s25,000/);
        fireEvent.click(screen.getByText(/^IQD\s100,000$/));
        expect(qiCardUpdate).toHaveBeenCalledWith({ refillAmount: 100_000 }, expect.anything());
        fireEvent.click(screen.getByTestId("qi-auto-refill-switch"));
        expect(qiCardUpdate).toHaveBeenCalledWith({ autoRefill: false }, expect.anything());
        fireEvent.click(screen.getByTestId("qi-remove-card"));
        expect(qiCardRemove).toHaveBeenCalled();
        // A saved card is kept: the pay form no longer offers to save one.
        fireEvent.click(screen.getByText("شحن المحفظة"));
        expect(screen.queryByTestId("qi-save-card")).toBeNull();
    });

    it("says auto refill stopped after 3 failed charges", () => {
        state.qiEnabled = true;
        state.qiCard = { ...SAVED_CARD, auto_refill: false, failures: 3 };
        show();
        expect(screen.getByTestId("qi-auto-refill").textContent).toContain("توقف الشحن التلقائي بعد 3 محاولات فاشلة");
    });

    it("hides the saved card when Qi payments are off", () => {
        state.qiCard = { ...SAVED_CARD };
        show();
        expect(screen.queryByTestId("qi-auto-refill")).toBeNull();
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

describe("BillingSettings plans (Fermi B1)", () => {
    const UPGRADE: PlanChangeResult = {
        success: true,
        kind: "upgrade",
        plan: "growth",
        current_plan: "starter",
        pending_plan: null,
        monthly_iqd: 25_000,
        order_fee_iqd: 55,
        charge_now_iqd: 8000,
        effective_at: "2026-11-16T00:00:00Z",
        period_end: "2026-12-01T00:00:00Z",
        seat_limit: 6,
        seats_used: 2,
        balance_iqd: 20_000,
        balance_ok: true,
    };

    it("shows the three plans with their prices, Team as the most chosen, Custom as contact us, and no Internal", () => {
        show();
        const picker = screen.getByTestId("plan-picker").textContent ?? "";
        expect(picker).toContain("البداية");
        expect(picker).toContain("الفريق");
        expect(picker).toContain("الأعمال");
        expect(picker).not.toContain("داخلي");
        const team = screen.getByTestId("plan-option-growth").textContent ?? "";
        expect(team).toContain("الأكثر اختياراً");
        expect(team).toMatch(/IQD\s25,000 بالشهر/);
        expect(team).toContain("+ 55 دينار على كل طلب واصل، والراجع ببلاش");
        expect(team).toContain("رسائل الواتساب من محفظتك");
        expect(screen.getByTestId("plan-option-starter").textContent).not.toContain("الأكثر اختياراً");
        expect(screen.getByTestId("plan-option-starter").textContent).toContain("باقتك الحالية");
        expect(screen.getByTestId("plan-option-professional").textContent).toContain("+ 40 دينار على كل طلب واصل");
        expect(screen.getByTestId("plan-option-professional").textContent).toContain("فروع كاشير مشمولة: 1");
        expect(screen.getByTestId("plan-option-custom").textContent).toContain("خاص");
        expect(screen.getByTestId("billing-plan-card").textContent).toContain("باقتك: البداية");
    });

    it("the calculator adds the fee on delivered orders to each plan", () => {
        show();
        fireEvent.change(screen.getByTestId("plan-calc-orders"), { target: { value: "1000" } });
        expect(screen.getByTestId("plan-calc-starter").textContent).toMatch(/IQD\s64,000/);
        expect(screen.getByTestId("plan-calc-growth").textContent).toMatch(/IQD\s80,000/);
        expect(screen.getByTestId("plan-calc-professional").textContent).toMatch(/IQD\s129,000/);
    });

    it("an admin choosing a bigger plan sees what is taken now, and confirms it", () => {
        state.planQuote = UPGRADE;
        show();
        fireEvent.click(screen.getByText("اختر الفريق"));
        expect(quotedPlans).toContain("growth");
        const dialog = screen.getByTestId("plan-change-dialog").textContent ?? "";
        expect(dialog).toMatch(/تبدأ الفريق الآن. ينخصم IQD\s8,000 من محفظتك عن باقي هذا الشهر./);
        expect(dialog).toContain("أعضاء الفريق: 2 من 6");
        fireEvent.click(screen.getByTestId("plan-change-confirm"));
        expect(applyPlan).toHaveBeenCalledWith("growth", expect.anything());
    });

    it("a wallet that cannot pay the upgrade cannot confirm it", () => {
        state.planQuote = { ...UPGRADE, balance_iqd: 3000, balance_ok: false };
        show();
        fireEvent.click(screen.getByText("اختر الفريق"));
        expect(screen.getByTestId("plan-change-dialog").textContent).toMatch(/محفظتك ناقصها IQD\s5,000/);
        expect((screen.getByTestId("plan-change-confirm") as HTMLButtonElement).disabled).toBe(true);
    });

    it("a smaller plan the team does not fit in is refused with the numbers", () => {
        state.sub = { ...state.sub, plan: "growth" };
        state.planQuote = { success: false, error: "too_many_members", seats_used: 4, seat_limit: 2, plan: "starter" };
        show();
        fireEvent.click(screen.getByText("اختر البداية"));
        expect(screen.getByTestId("plan-change-dialog").textContent).toContain("عندك 4 أعضاء بالفريق، والبداية تسمح بـ 2.");
        expect((screen.getByTestId("plan-change-confirm") as HTMLButtonElement).disabled).toBe(true);
    });

    it("in the trial the pick is what the payment buys, and the plan card says so", () => {
        state.tenant = tenant("trial", new Date(Date.now() + 3 * 86_400_000).toISOString());
        state.sub = { ...state.sub, plan: "growth", status: "trialing", pending_plan: "starter" };
        state.lock = { ...LOCK, plan: "starter", price_iqd: 9000 };
        show();
        expect(screen.getByTestId("plan-pending").textContent).toContain("بعد التجربة: البداية");
        expect(screen.getByTestId("plan-option-starter").textContent).toContain("اخترتها");
        expect(screen.getByText("اختر الفريق")).toBeTruthy();
        expect(screen.getByTestId("billing-plan-card").textContent).toMatch(/يُخصم IQD\s9,000/);
    });

    it("a smaller plan waiting for the renewal shows its date, and the admin can stay", () => {
        state.sub = { ...state.sub, plan: "growth", pending_plan: "starter", plan_change_at: state.sub.current_period_end };
        show();
        expect(screen.getByTestId("plan-pending").textContent).toContain("تصير باقتك البداية");
        expect(screen.getByTestId("plan-option-starter").textContent).toContain("تبدأ");
        expect(screen.getByText("ابقَ على الفريق")).toBeTruthy();
    });

    it("staff who are not the admin see the plans and cannot change them", () => {
        state.lock = { ...LOCK, can_pay: false };
        show();
        expect(screen.queryByText("اختر الفريق")).toBeNull();
        expect(screen.getByText("صاحب المتجر يقدر يغيّر الباقة.")).toBeTruthy();
    });

    it("Start sells no add-ons", () => {
        show();
        expect(screen.queryByTestId("addons-card")).toBeNull();
    });

    it("on Team, an extra member is reviewed with its cost before it is bought", () => {
        state.sub = { ...state.sub, plan: "growth" };
        state.addons = { extra_member: 1, pos_branch: 0 };
        state.addonQuote = {
            success: true,
            kind: "extra_member",
            plan: "growth",
            quantity_from: 1,
            quantity_to: 2,
            unit_price_iqd: 5000,
            monthly_iqd: 35_000,
            charge_now_iqd: 2500,
            balance_iqd: 20_000,
            balance_ok: true,
        };
        show();
        expect(screen.getByTestId("addons-card").textContent).toContain("فروع الكاشير");
        expect(screen.getByTestId("addon-extra_member-qty").textContent).toBe("1");
        fireEvent.click(within(screen.getByTestId("addon-extra_member")).getByLabelText("أكثر"));
        fireEvent.click(screen.getByText("راجع وأكّد"));
        const dialog = screen.getByTestId("addon-change-dialog").textContent ?? "";
        expect(dialog).toContain("أعضاء إضافيين بالفريق: من 1 إلى 2");
        expect(dialog).toMatch(/ينخصم IQD\s2,500 من محفظتك/);
        fireEvent.click(screen.getByTestId("addon-change-confirm"));
        expect(applyAddon).toHaveBeenCalledWith({ kind: "extra_member", quantity: 2 }, expect.anything());
    });

    it("wallet history names plan upgrades, add-ons and fees given back", () => {
        state.transactions = [
            tx({ type: "refund", amount_iqd: 55, description: "Delivered order 4370 undone" }),
            tx({ amount_iqd: -8000, description: "Plan upgrade to growth plan (rest of this month)" }),
            tx({ amount_iqd: -2500, description: "Add-on extra_member x2 (rest of this month)" }),
        ];
        show();
        expect(screen.getByText("رجعنا رسم الطلب #4370")).toBeTruthy();
        expect(screen.getByText("ترقية إلى الفريق (باقي الشهر)")).toBeTruthy();
        expect(screen.getByText("أعضاء إضافيين بالفريق +2 (باقي الشهر)")).toBeTruthy();
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
