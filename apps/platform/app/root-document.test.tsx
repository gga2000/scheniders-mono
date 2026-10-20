// The app is LTR in every locale, Arabic included (CLAUDE.md): the root
// document sets `<html lang>` and never `<html dir>`. LTR is the HTML default,
// so leaving `dir` off is what keeps every page LTR — and keeps an RTL `dir`
// from ever being reintroduced on the document element.

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { Passthrough, Nothing } = vi.hoisted(() => ({
    Passthrough: ({ children }: { children?: ReactNode }) => children,
    Nothing: () => null,
}));

vi.mock("next/font/google", () => ({
    Geist: () => ({ variable: "font-geist-sans" }),
    Geist_Mono: () => ({ variable: "font-geist-mono" }),
}));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
vi.mock("@/lib/env", () => ({}));
vi.mock("@/components/layout/dashboard-layout", () => ({ DashboardLayout: Passthrough }));
vi.mock("@/components/chat/chat-runtime", () => ({ ChatRuntime: Nothing }));
vi.mock("@/components/pwa/pwa-provider", () => ({ PWAProvider: Passthrough }));
vi.mock("@/components/auth/auth-provider", () => ({ AuthProvider: Passthrough }));
vi.mock("@/components/orders/new-order-alerts", () => ({ NewOrderAlerts: Nothing }));
vi.mock("@/components/providers/query-provider", () => ({ QueryProvider: Passthrough }));
vi.mock("@/components/providers/theme-provider", () => ({ ThemeProvider: Passthrough }));
vi.mock("@/components/providers/language-provider", () => ({ LanguageProvider: Passthrough }));
vi.mock("@/components/providers/role-provider", () => ({ RoleProvider: Passthrough }));
vi.mock("@/components/providers/financial-visibility-provider", () => ({
    FinancialVisibilityProvider: Passthrough,
}));
vi.mock("@/components/pwa/dev-service-worker-cleanup", () => ({ DevServiceWorkerCleanup: Nothing }));
vi.mock("@/components/ui/toaster", () => ({ Toaster: Nothing }));
vi.mock("@scheniders/ui/error-boundary", () => ({ ErrorBoundary: Passthrough }));
vi.mock("@vercel/speed-insights/next", () => ({ SpeedInsights: Nothing }));

import RootLayout from "./layout";
import GlobalError from "./global-error";

function htmlOpeningTag(markup: string): string {
    const tag = markup.match(/<html\b[^>]*>/)?.[0];
    if (tag === undefined) throw new Error(`no <html> element in: ${markup.slice(0, 200)}`);
    return tag;
}

describe("platform root document", () => {
    it("root layout sets <html lang> and no dir", () => {
        const tag = htmlOpeningTag(
            renderToStaticMarkup(
                <RootLayout>
                    <main>page</main>
                </RootLayout>,
            ),
        );
        expect(tag).toMatch(/\slang="ar"/);
        expect(tag).not.toMatch(/\sdir=/);
    });

    it("global error boundary sets <html lang> and no dir", () => {
        const tag = htmlOpeningTag(
            renderToStaticMarkup(<GlobalError error={new Error("boom")} reset={() => undefined} />),
        );
        expect(tag).toMatch(/\slang="ar"/);
        expect(tag).not.toMatch(/\sdir=/);
    });
});
