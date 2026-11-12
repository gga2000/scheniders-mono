import { describe, it, expect, vi, afterEach } from "vitest";
import { revokeDevicePush } from "./revoke-device-push";

function withSubscription(sub: { endpoint: string; unsubscribe: () => Promise<boolean> } | null) {
    vi.stubGlobal("navigator", {
        serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => sub } }) },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("revokeDevicePush", () => {
    it("deletes this browser's row with the caller's token, then unsubscribes", async () => {
        const unsubscribe = vi.fn(async () => true);
        withSubscription({ endpoint: "https://fcm.googleapis.com/x", unsubscribe });
        const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
        vi.stubGlobal("fetch", fetchMock);
        await revokeDevicePush("tok");
        expect(fetchMock).toHaveBeenCalledWith("/api/chat/push/unsubscribe", expect.objectContaining({
            method: "POST",
            headers: expect.objectContaining({ Authorization: "Bearer tok" }),
            body: JSON.stringify({ endpoint: "https://fcm.googleapis.com/x" }),
        }));
        expect(unsubscribe).toHaveBeenCalledOnce();
    });

    it("throws, keeping the subscription, when the server refuses", async () => {
        const unsubscribe = vi.fn(async () => true);
        withSubscription({ endpoint: "e", unsubscribe });
        vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));
        await expect(revokeDevicePush("tok")).rejects.toThrow("500");
        expect(unsubscribe).not.toHaveBeenCalled();
    });

    it("does nothing without a subscription", async () => {
        withSubscription(null);
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
        await revokeDevicePush("tok");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
