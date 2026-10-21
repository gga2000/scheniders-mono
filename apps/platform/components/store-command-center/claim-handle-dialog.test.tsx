/// <reference types="vitest/globals" />
// @vitest-environment jsdom

import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@/hooks/use-auth", () => ({
    useAuth: () => ({ session: { access_token: "tok-123" } }),
}));

import { ClaimHandleDialog } from "./claim-handle-dialog";

const fetchMock = vi.fn<typeof fetch>();

function wrap(children: ReactNode) {
    return <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;
}

function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

/** Type a candidate and let the 350ms debounce fire. */
async function typeSlug(slug: string): Promise<void> {
    fireEvent.change(screen.getByTestId("claim-handle-input"), { target: { value: slug } });
    await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
    });
}

beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe("ClaimHandleDialog", () => {
    it("checks availability and renames with the session's Bearer token", async () => {
        fetchMock
            .mockResolvedValueOnce(json({ available: true }))
            .mockResolvedValueOnce(json({ ok: true, slug: "zahraa-beauty", previous: "old" }));
        const onClose = vi.fn();
        render(wrap(<ClaimHandleDialog currentSlug="old" onClose={onClose} locale="en" />));

        await typeSlug("Zahraa-Beauty");
        expect(fetchMock).toHaveBeenCalledWith("/api/tenant/slug?slug=zahraa-beauty", {
            headers: { Authorization: "Bearer tok-123" },
        });
        expect(screen.getByTestId("claim-handle-available")).toBeTruthy();

        vi.useRealTimers();
        fireEvent.click(screen.getByTestId("claim-handle-save"));
        await waitFor(() => expect(onClose).toHaveBeenCalled());
        const [url, init] = fetchMock.mock.calls[1] ?? [];
        expect(url).toBe("/api/tenant/slug");
        expect(init?.method).toBe("PATCH");
        expect(init?.headers).toEqual({
            "Content-Type": "application/json",
            Authorization: "Bearer tok-123",
        });
        expect(init?.body).toBe(JSON.stringify({ slug: "zahraa-beauty" }));
    });

    it("says the check failed (and blocks Save) instead of keeping a stale verdict", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        fetchMock.mockResolvedValueOnce(json({ error: "Unauthorized" }, 401));
        render(wrap(<ClaimHandleDialog currentSlug="old" onClose={() => {}} locale="en" />));

        await typeSlug("noor-beauty");
        expect(screen.getByTestId("claim-handle-check-failed")).toBeTruthy();
        expect((screen.getByTestId("claim-handle-save") as HTMLButtonElement).disabled).toBe(true);
    });

    it("flags a reserved name without asking the server", async () => {
        render(wrap(<ClaimHandleDialog currentSlug="old" onClose={() => {}} locale="en" />));
        await typeSlug("admin");
        expect(screen.getByTestId("claim-handle-reserved")).toBeTruthy();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("keeps the dialog open and shows the error when the rename is refused", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        fetchMock
            .mockResolvedValueOnce(json({ available: true }))
            .mockResolvedValueOnce(json({ error: "This action requires an administrator." }, 403));
        const onClose = vi.fn();
        render(wrap(<ClaimHandleDialog currentSlug="old" onClose={onClose} locale="en" />));

        await typeSlug("noor-beauty");
        vi.useRealTimers();
        fireEvent.click(screen.getByTestId("claim-handle-save"));
        await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
        expect(onClose).not.toHaveBeenCalled();
    });
});
