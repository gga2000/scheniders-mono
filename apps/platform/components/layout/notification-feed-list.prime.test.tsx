// The feed's Prime lines: what each one says, in the reader's language, with
// money hidden until it is revealed.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { FeedNotification } from "@/hooks/use-notification-feed";
import { translations } from "@/lib/i18n";
import { buildFeedSections } from "@/lib/notification-feed-sections";

const visibility = { revealed: true, canReveal: true, toggle: () => {} };

const language = {
    language: "ar" as const,
    setLanguage: () => {},
    t: (key: string, fallback?: unknown, vars?: Record<string, string | number>) => {
        const template = translations.ar[key] ?? (typeof fallback === "string" ? fallback : key);
        const values = typeof fallback === "object" && fallback !== null ? (fallback as Record<string, string | number>) : vars;
        return values ? template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`)) : template;
    },
};

vi.mock("@/components/providers/language-provider", () => ({
    LanguageContext: { Provider: ({ children }: { children: unknown }) => children },
    useLanguage: () => language,
}));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => language }));
vi.mock("@/components/providers/financial-visibility-provider", () => ({ useFinancialVisibility: () => visibility }));

import { NotificationFeedList } from "./notification-feed-list";

const NOW = new Date("2026-11-04T12:00:00");

const notice = (type: string, payload: Record<string, unknown>, over: Partial<FeedNotification> = {}): FeedNotification => ({
    id: `${type}-${Math.random()}`,
    type,
    category: "delivery",
    actor_name: "Prime",
    actor_avatar: null,
    entity_type: null,
    entity_id: null,
    entity_label: null,
    payload,
    priority: "normal",
    group_key: `${type}:${Math.random()}`,
    created_at: NOW.toISOString(),
    is_read: false,
    ...over,
});

function show(items: FeedNotification[]) {
    render(
        <NotificationFeedList
            sections={buildFeedSections(items, NOW)}
            unreadBoundary={null}
            openingId={null}
            onOpen={() => {}}
            onMarkRead={() => {}}
            onDismiss={() => {}}
            onMute={() => {}}
        />,
    );
}

afterEach(() => {
    cleanup();
    visibility.revealed = true;
});

describe("Prime lines in the feed", () => {
    it("says what Prime did, by customer or by governorate", () => {
        show([
            notice("prime.delivered", { count: 5, city: "بغداد", customer: null }),
            notice("prime.returning", { customer: "مريم سعد" }, { entity_type: "order", entity_id: "o1", entity_label: "#4261103016" }),
            notice("prime.price_changed", { customer: null }, { entity_type: "order", entity_id: "o2", entity_label: "#4261103017" }),
        ]);
        expect(screen.getByText("سُلّمت 5 طلبات في بغداد · نُقلت إلى «تم التوصيل»")).toBeTruthy();
        expect(screen.getByText("طرد مريم سعد راجع")).toBeTruthy();
        expect(screen.getByText("سُلّم طلب #4261103017 بسعر جديد · راجعه")).toBeTruthy();
        // Prime, not "Automation", did it.
        expect(screen.getAllByText("برايم")).toHaveLength(3);
    });

    it("shows a payment and the day's money only when money is revealed", () => {
        const items = [
            notice("prime.payment", { amount: 1_284_250, parcels: 40, matched: 39, different: 1 }),
            notice("prime.daily", { delivered: 37, returning: 6, collected: 1_361_250 }),
        ];
        show(items);
        expect(screen.getByText(/وصلت دفعة من برايم: .*1,284,250 · 39 مطابق · 1 مختلف/)).toBeTruthy();
        expect(screen.getByText(/يومك مع برايم: سُلّم 37 · راجع 6 · حُصّل .*1,361,250/)).toBeTruthy();

        cleanup();
        visibility.revealed = false;
        show(items);
        expect(screen.queryByText(/1,284,250/)).toBeNull();
        expect(screen.queryByText(/1,361,250/)).toBeNull();
    });
});
