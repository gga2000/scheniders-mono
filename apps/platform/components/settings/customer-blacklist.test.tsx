/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/components/providers/language-provider";
import { CustomerBlacklist } from "./customer-blacklist";

const addToBlacklist = vi.fn(async () => undefined);
const removeFromBlacklist = vi.fn(async () => undefined);
const listBlacklist = vi.fn(async () => [
    { phone: "7801234567", reason: "Fake orders", notes: null, added_by: "Noor", created_at: "2026-11-01T10:00:00Z" },
]);

vi.mock("@/lib/blacklist", () => ({
    addToBlacklist: (...a: unknown[]) => addToBlacklist(...(a as [])),
    removeFromBlacklist: (...a: unknown[]) => removeFromBlacklist(...(a as [])),
    listBlacklist: (...a: unknown[]) => listBlacklist(...(a as [])),
}));
vi.mock("@/hooks/use-toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/auth/auth-provider", () => ({
    useAuth: () => ({ tenantId: "tenant-1", profile: { display_name: "Ali" }, user: null }),
}));
vi.mock("@/hooks/use-permission", () => ({ usePermission: () => ({ can: () => true }) }));

afterEach(() => {
    cleanup();
    addToBlacklist.mockClear();
    removeFromBlacklist.mockClear();
});

function renderList() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
        <QueryClientProvider client={client}>
            <LanguageProvider>
                <CustomerBlacklist />
            </LanguageProvider>
        </QueryClientProvider>,
    );
}

// The app opens in Arabic, so these read the Arabic labels.
describe("Settings blacklist", () => {
    it("shows the numbers from the blacklist table (same list as Customers)", async () => {
        renderList();
        expect(await screen.findByText("0780 123 4567")).toBeTruthy();
        expect(listBlacklist).toHaveBeenCalledWith("tenant-1");
    });

    it("blocks through the shared blacklist write, with the tenant and author", async () => {
        renderList();
        fireEvent.change(await screen.findByPlaceholderText("07XXXXXXXXX"), { target: { value: "07709998887" } });
        fireEvent.change(screen.getByLabelText("السبب"), { target: { value: "No answer" } });
        fireEvent.click(screen.getByText("احظر"));
        await waitFor(() => expect(addToBlacklist).toHaveBeenCalled());
        expect(addToBlacklist).toHaveBeenCalledWith(
            expect.objectContaining({ tenantId: "tenant-1", phone: "07709998887", reason: "No answer", addedBy: "Ali" }),
        );
    });

    it("refuses a number that is already blocked, in any format", async () => {
        renderList();
        fireEvent.change(await screen.findByPlaceholderText("07XXXXXXXXX"), { target: { value: "+964 780 123 4567" } });
        fireEvent.change(screen.getByLabelText("السبب"), { target: { value: "Again" } });
        fireEvent.click(screen.getByText("احظر"));
        expect(await screen.findByText("هذا الرقم محظور من قبل")).toBeTruthy();
        expect(addToBlacklist).not.toHaveBeenCalled();
    });

    it("unblocks through the shared delete", async () => {
        renderList();
        fireEvent.click(await screen.findByLabelText("فك الحظر"));
        await waitFor(() => expect(removeFromBlacklist).toHaveBeenCalledWith("tenant-1", "7801234567"));
    });
});
