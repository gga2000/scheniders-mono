// A shop's own wording for the automatic WhatsApp messages (paid extra,
// 15,000 IQD): where each message stands, the editor's checks and preview,
// and the bell's lines when our team or Meta answers.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { CustomTemplate, CustomTemplateSlot } from "@/hooks/use-custom-whatsapp-templates";
import type { FeedNotification } from "@/hooks/use-notification-feed";
import { translations } from "@/lib/i18n";
import { buildFeedSections } from "@/lib/notification-feed-sections";

const language = {
    language: "ar" as const,
    setLanguage: () => {},
    t: (key: string, fallback?: unknown, vars?: Record<string, string | number>) => {
        const values = typeof fallback === "object" && fallback !== null ? (fallback as Record<string, string | number>) : vars;
        const template = translations.ar[key] ?? (typeof fallback === "string" ? fallback : key);
        return values ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`)) : template;
    },
};

const auth = { role: "admin" as string, tenantId: "t1" };
const wallet = { balance_iqd: 20000 as number };
const request = { mutate: vi.fn(), isPending: false };
const withdraw = { mutate: vi.fn(), isPending: false };
const switchUse = { mutate: vi.fn(), isPending: false };
const EMPTY: CustomTemplateSlot = { live: null, open: null, ended: null };
let slots: Record<"confirmation" | "reminder" | "discount", CustomTemplateSlot>;

vi.mock("@/components/providers/language-provider", () => ({
    LanguageContext: { Provider: ({ children }: { children: unknown }) => children },
    useLanguage: () => language,
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => language }));
vi.mock("@/components/providers/financial-visibility-provider", () => ({
    useFinancialVisibility: () => ({ revealed: true, canReveal: true, toggle: () => {} }),
}));
vi.mock("@/components/auth/auth-provider", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/use-billing", () => ({ useBilling: () => ({ wallet }) }));
vi.mock("@/hooks/use-tenant", () => ({ useTenant: () => ({ data: { is_demo: false } }) }));
// The header picture is not what these tests read.
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/hooks/use-custom-whatsapp-templates", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/hooks/use-custom-whatsapp-templates")>()),
    useCustomWhatsappTemplates: () => ({ isLoading: false, isError: false, data: { priceIqd: 15000, slots } }),
    useRequestCustomTemplate: () => request,
    useWithdrawCustomTemplate: () => withdraw,
    useSwitchCustomTemplate: () => switchUse,
}));

import { CustomWhatsappMessages } from "./custom-whatsapp-messages";
import { NotificationFeedList } from "@/components/layout/notification-feed-list";

const row = (status: CustomTemplate["status"], over: Partial<CustomTemplate> = {}): CustomTemplate => ({
    id: `id-${status}`,
    purpose: "confirmation",
    body: "هلا {customer_name}، طلبك من {store_name} وصلنا.",
    template_name: "custom_confirmation_100095_1",
    status,
    category: null,
    in_use: false,
    price_iqd: 15000,
    reason: null,
    created_at: "2026-11-26T10:00:00Z",
    sent_to_meta_at: null,
    decided_at: null,
    refunded_at: null,
    ...over,
});

const text = (s: string) => screen.getByText((content) => content.includes(s));

beforeEach(() => {
    slots = { confirmation: EMPTY, reminder: EMPTY, discount: EMPTY };
    auth.role = "admin";
    wallet.balance_iqd = 20000;
    request.mutate.mockReset();
    withdraw.mutate.mockReset();
    switchUse.mutate.mockReset();
});
afterEach(cleanup);

describe("the three messages", () => {
    it("are Fermi's, free, until the shop pays for its own", () => {
        render(<CustomWhatsappMessages />);
        expect(screen.getAllByText("رسالة فيرمي، مجانية")).toHaveLength(3);
        expect(screen.getAllByRole("button", { name: /^اكتبها بكلامك · .*15,000 د.ع/ })).toHaveLength(3);
    });

    it("waiting for our team: the shop can take it back, not send another", () => {
        slots.confirmation = { ...EMPTY, open: row("review") };
        render(<CustomWhatsappMessages />);
        const card = screen.getByTestId("custom-wa-confirmation");
        expect(card.textContent).toContain("دا نراجع رسالتك");
        fireEvent.click(screen.getByRole("button", { name: "اسحب الطلب ورجّع فلوسي" }));
        expect(withdraw.mutate).toHaveBeenCalledWith("id-review", expect.anything());
        expect(card.textContent).not.toContain("اكتبها بكلامك");
    });

    it("approved as marketing: says each message costs the offer price, and can be switched off", () => {
        slots.confirmation = { ...EMPTY, live: row("live", { in_use: true, category: "marketing" }) };
        render(<CustomWhatsappMessages />);
        const card = screen.getByTestId("custom-wa-confirmation");
        expect(card.textContent).toContain("رسالتك الخاصة شغّالة");
        expect(card.textContent).toContain("ميتا صنفتها رسالة تسويق");
        fireEvent.click(screen.getByRole("switch"));
        expect(switchUse.mutate).toHaveBeenCalledWith({ id: "id-live", use: false }, expect.anything());
    });

    it("refused: says the money came back and why, and offers to fix it", () => {
        slots.reminder = { ...EMPTY, ended: row("rejected", { purpose: "reminder", reason: "فيه كلام تسويق" }) };
        render(<CustomWhatsappMessages />);
        const card = screen.getByTestId("custom-wa-reminder");
        expect(card.textContent).toContain("ميتا رفضت رسالتك ورجعنالك");
        expect(card.textContent).toContain("السبب: فيه كلام تسويق");
        expect(card.textContent).toContain("عدّلها ودزها مرة ثانية");
    });

    it("an employee reads where each stands but cannot pay or switch", () => {
        auth.role = "employee";
        slots.confirmation = { ...EMPTY, live: row("live", { in_use: true, category: "utility" }) };
        render(<CustomWhatsappMessages />);
        expect(screen.queryAllByRole("button")).toHaveLength(0);
        expect(screen.queryByRole("switch")).toBeNull();
        expect(text("بس مدير المتجر يكدر")).toBeTruthy();
    });
});

describe("the editor", () => {
    function openConfirmation() {
        render(<CustomWhatsappMessages />);
        fireEvent.click(screen.getAllByRole("button", { name: /^اكتبها بكلامك/ })[0]);
        return screen.getByRole("textbox") as HTMLTextAreaElement;
    }

    it("starts from Fermi's wording, with the fields in the shop's words, and previews a sample order", () => {
        const box = openConfirmation();
        expect(box.value).toContain("يا هلا ومرحبا {اسم الزبون}");
        expect(box.value).not.toContain("{customer_name}");
        expect(text("يا هلا ومرحبا علي حسن")).toBeTruthy();
        expect(screen.getAllByText("تأكيد الطلب").length).toBeGreaterThan(0);
    });

    it("pays with the text in key form", () => {
        const box = openConfirmation();
        fireEvent.change(box, { target: { value: "هلا {اسم الزبون}، طلبك من {اسم المتجر} وصلنا." } });
        fireEvent.click(screen.getByRole("button", { name: /^ادفع .*15,000 د.ع.* ودزها للمراجعة$/ }));
        expect(request.mutate).toHaveBeenCalledWith(
            { purpose: "confirmation", body: "هلا {customer_name}، طلبك من {store_name} وصلنا." },
            expect.anything(),
        );
    });

    it("says what is wrong and holds the payment until it is fixed", () => {
        const box = openConfirmation();
        fireEvent.change(box, { target: { value: "هلا {اسم الزبون} طلبك وصلنا shop.com هنا" } });
        expect(text("لازم تضيف اسم المتجر")).toBeTruthy();
        const pay = screen.getByRole("button", { name: /^ادفع/ }) as HTMLButtonElement;
        expect(pay.disabled).toBe(true);
        fireEvent.click(screen.getByRole("button", { name: "اسم المتجر" }));
        expect(box.value).toContain("{اسم المتجر}");
        expect(text("ما نكدر ندز روابط")).toBeTruthy();
    });

    it("a wallet short of the price points to topping up", () => {
        wallet.balance_iqd = 5000;
        openConfirmation();
        expect(text("اشحن المحفظة أول")).toBeTruthy();
        expect((screen.getByRole("button", { name: /^ادفع/ }) as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByRole("link", { name: "اشحن المحفظة" }).getAttribute("href")).toBe("/settings?section=billing&pay=1");
    });
});

describe("the bell", () => {
    const notice = (type: string, payload: Record<string, unknown>): FeedNotification => ({
        id: type,
        type,
        category: "finance",
        actor_name: null,
        actor_avatar: null,
        entity_type: null,
        entity_id: null,
        entity_label: null,
        payload,
        priority: "normal",
        group_key: type,
        created_at: new Date("2026-11-26T12:00:00").toISOString(),
        is_read: false,
    });
    const show = (n: FeedNotification) =>
        render(
            <NotificationFeedList
                sections={buildFeedSections([n], new Date("2026-11-26T12:30:00"))}
                unreadBoundary={null}
                openingId={null}
                onOpen={() => {}}
                onMarkRead={() => {}}
                onDismiss={() => {}}
                onMute={() => {}}
            />,
        );

    it("says which message went live", () => {
        show(notice("whatsapp.custom_live", { purpose: "reminder", category: "utility" }));
        expect(text("ميتا وافقت على رسالتك الخاصة (تذكير بالطلب)")).toBeTruthy();
    });

    it("says who refused it, the refund and the reason", () => {
        show(notice("whatsapp.custom_rejected", { purpose: "discount", amount: 15000, reason: "فيه رابط", by: "fermi" }));
        expect(text("ما مشّينا رسالتك (عرض الخصم) ورجعنالك")).toBeTruthy();
        expect(text("السبب: فيه رابط")).toBeTruthy();
    });
});
