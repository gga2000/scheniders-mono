import { beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const updateUser = vi.fn();
const consumeRateLimit = vi.fn();
const recordPasswordStrength = vi.fn();
const reportOrderError = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServerClient: async () => ({ auth: { getUser, updateUser } }),
    createSupabaseServiceClient: () => ({ service: true }),
}));
vi.mock("@/lib/password-reminder", () => ({
    recordPasswordStrength: (...args: unknown[]) => recordPasswordStrength(...args),
}));
vi.mock("@/lib/rate-limit", () => ({
    consumeRateLimit: (...args: unknown[]) => consumeRateLimit(...args),
    rateLimitHeaders: () => ({ "Retry-After": "60" }),
}));
vi.mock("@/lib/order-telemetry", () => ({ reportOrderError: (...args: unknown[]) => reportOrderError(...args) }));

import { AuthApiError, AuthWeakPasswordError } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { POST } from "./route";

const USER = { id: "user-1", email: "owner@shop.iq" };

function request(body: unknown) {
    return new NextRequest("https://app.test/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

describe("POST /api/auth/password", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        getUser.mockResolvedValue({ data: { user: USER }, error: null });
        updateUser.mockResolvedValue({ data: { user: USER }, error: null });
        consumeRateLimit.mockResolvedValue({ allowed: true, remaining: 9, resetAt: null, retryAfterSeconds: 0 });
        recordPasswordStrength.mockResolvedValue(undefined);
    });

    it("sets a weak password on the signed-in account and keeps its reminder", async () => {
        const res = await POST(request({ password: "layla2024" }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, data: { weak: true } });
        expect(updateUser).toHaveBeenCalledWith({ password: "layla2024" });
        expect(recordPasswordStrength).toHaveBeenCalledWith({ service: true }, "user-1", "layla2024");
    });

    it("says a stronger password is not weak (its reminder is cleared)", async () => {
        const res = await POST(request({ password: "Layla2024!" }));
        expect(await res.json()).toEqual({ success: true, data: { weak: false } });
        expect(recordPasswordStrength).toHaveBeenCalledWith({ service: true }, "user-1", "Layla2024!");
    });

    it("needs a signed-in account", async () => {
        getUser.mockResolvedValue({ data: { user: null }, error: null });
        const res = await POST(request({ password: "layla2024" }));
        expect(res.status).toBe(401);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it("refuses a password shorter than 8 before asking Supabase", async () => {
        const res = await POST(request({ password: "short1" }));
        expect(res.status).toBe(400);
        expect(updateUser).not.toHaveBeenCalled();
    });

    it("passes on Supabase's refusals as codes the page words for the owner", async () => {
        updateUser.mockResolvedValueOnce({ data: { user: null }, error: new AuthWeakPasswordError("weak", 422, ["pwned"]) });
        let res = await POST(request({ password: "12345678" }));
        expect(res.status).toBe(422);
        expect(await res.json()).toMatchObject({ code: "weak_password", reasons: ["pwned"] });

        updateUser.mockResolvedValueOnce({ data: { user: null }, error: new AuthApiError("same", 422, "same_password") });
        res = await POST(request({ password: "layla2024" }));
        expect(await res.json()).toMatchObject({ code: "same_password" });

        updateUser.mockResolvedValueOnce({ data: { user: null }, error: new AuthApiError("reauth", 400, "reauthentication_needed") });
        res = await POST(request({ password: "layla2024" }));
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({ code: "reauthentication_needed" });
        expect(recordPasswordStrength).not.toHaveBeenCalled();
    });

    it("reports a reminder that could not be saved, and still tells the owner the password changed", async () => {
        recordPasswordStrength.mockRejectedValue(new Error("db down"));
        const res = await POST(request({ password: "layla2024" }));
        expect(res.status).toBe(200);
        expect(reportOrderError).toHaveBeenCalled();
    });
});
