// The feed's top-up lines (Fermi B3): an approved receipt says what was added,
// a refused one says why, in our team's words.

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
        const values = typeof fallback === "object" && fallback !== null ? (fallback as Record<string, string | number>) : vars;
        // The provider's plural pick: a numeric count uses <key>.one/.two/.few/.many when the dictionary has it.
        const count = values?.count;
        const form = typeof count !== "number" ? undefined : translations.ar[`${key}.${count === 0 ? "zero" : new Intl.PluralRules("ar").select(count)}`];
        const template = form ?? translations.ar[key] ?? (typeof fallback === "string" ? fallback : key);
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
    category: "finance",
    actor_name: null,
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

describe("Top-up lines in the feed", () => {
    it("says what was added to the wallet", () => {
        show([notice("wallet.topup_approved", { amount: 9000, asked: 10000, receipt_no: 3 })]);
        expect(screen.getByText(/^أُضيف IQD\s9,000 إلى محفظتك$/)).toBeTruthy();
    });

    it("gives our team's reason for a refusal and asks for the receipt again", () => {
        show([notice("wallet.topup_rejected", { amount: 10000, reason: "الوصل مقطوع" })]);
        expect(screen.getByText(/^رُفض شحن IQD\s10,000: الوصل مقطوع\. أرسل الوصل مرة ثانية$/)).toBeTruthy();
    });

    it("keeps the old line for a refusal sent before reasons existed", () => {
        show([notice("wallet.topup_rejected", { amount: 10000 })]);
        expect(screen.getByText(/^رُفض شحن IQD\s10,000\. تأكد من الوصل وأرسله مرة أخرى$/)).toBeTruthy();
    });
});
