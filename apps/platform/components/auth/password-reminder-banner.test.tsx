import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordReminderBanner } from "./password-reminder-banner";

const H = vi.hoisted(() => ({ remindAt: null as string | null }));

vi.mock("next/link", () => ({
    default: ({ href, children, className }: { href: string; children: ReactNode; className?: string }) => (
        <a href={href} className={className}>{children}</a>
    ),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/use-language", () => ({ useLanguage: () => ({ t: (k: string) => k }), useTextDir: () => "ltr" }));
vi.mock("@/lib/supabase", () => ({
    supabase: {
        from: () => ({
            select: () => ({
                maybeSingle: async () => ({ data: H.remindAt === null ? null : { remind_at: H.remindAt }, error: null }),
            }),
        }),
    },
}));

function renderBanner() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <PasswordReminderBanner />
        </QueryClientProvider>,
    );
}

describe("PasswordReminderBanner", () => {
    const fetchMock = vi.fn();
    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    it("asks once the week is up, and «later» puts it away for another week", async () => {
        H.remindAt = new Date(Date.now() - 60_000).toISOString();
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
        renderBanner();

        expect(await screen.findByTestId("password-reminder-banner")).toBeTruthy();
        expect(screen.getByText("pwremind.change").closest("a")?.getAttribute("href")).toBe("/reset-password");

        fireEvent.click(screen.getByText("pwremind.later"));
        await waitFor(() => expect(screen.queryByTestId("password-reminder-banner")).toBeNull());
        expect(fetchMock).toHaveBeenCalledWith("/api/auth/password-reminder", { method: "POST" });
    });

    it("stays away before the week is up, and for a strong password (no reminder)", async () => {
        H.remindAt = new Date(Date.now() + 86_400_000).toISOString();
        const { unmount } = renderBanner();
        await waitFor(() => expect(screen.queryByTestId("password-reminder-banner")).toBeNull());
        unmount();

        H.remindAt = null;
        renderBanner();
        await waitFor(() => expect(screen.queryByTestId("password-reminder-banner")).toBeNull());
    });

    it("says so when «later» could not be saved, and keeps asking", async () => {
        H.remindAt = new Date(Date.now() - 60_000).toISOString();
        fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
        renderBanner();

        fireEvent.click(await screen.findByText("pwremind.later"));
        expect(await screen.findByText("pwremind.laterFailed")).toBeTruthy();
        expect(screen.getByTestId("password-reminder-banner")).toBeTruthy();
    });
});
