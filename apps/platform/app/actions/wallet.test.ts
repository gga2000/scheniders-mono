import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const from = vi.fn();
const requirePlatformAdmin = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
    createSupabaseServiceClient: () => ({ rpc, from }),
}));
vi.mock("@/lib/auth/require-action-caller", () => ({
    requirePlatformAdmin: (...args: unknown[]) => requirePlatformAdmin(...args),
}));

import { topUpWalletAction } from "./wallet";

const TENANT = "11111111-1111-1111-1111-111111111111";

describe("topUpWalletAction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        requirePlatformAdmin.mockResolvedValue({ ok: true, userId: "u1" });
    });

    it("credits through the atomic RPC in one call and never reads/writes the wallet tables", async () => {
        rpc.mockResolvedValue({ data: { success: true, new_balance: 15000 }, error: null });

        const res = await topUpWalletAction(TENANT, 5000, "manual", "key-1", "tok");

        expect(res).toEqual({ success: true, newBalance: 15000 });
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc).toHaveBeenCalledWith("admin_topup_wallet", {
            _tenant_id: TENANT,
            _amount: 5000,
            _description: "Wallet top-up via manual",
            _payment_method: "manual",
            _reference_id: "key-1",
        });
        expect(from).not.toHaveBeenCalled();
    });

    it("reports an RPC failure instead of success", async () => {
        rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
        const res = await topUpWalletAction(TENANT, 5000, "manual", undefined, "tok");
        expect(res.success).toBe(false);
        expect(res.error).toContain("boom");
    });

    it("reports a missing wallet", async () => {
        rpc.mockResolvedValue({ data: { success: false, error: "No wallet found" }, error: null });
        const res = await topUpWalletAction(TENANT, 5000, "manual", undefined, "tok");
        expect(res).toEqual({ success: false, error: "No wallet found" });
    });

    it("rejects non-platform-admins before touching the database", async () => {
        requirePlatformAdmin.mockResolvedValue({ ok: false, error: "Forbidden" });
        const res = await topUpWalletAction(TENANT, 5000, "manual", undefined, "tok");
        expect(res.success).toBe(false);
        expect(rpc).not.toHaveBeenCalled();
    });

    it("rejects non-positive and over-limit amounts", async () => {
        expect((await topUpWalletAction(TENANT, 0, "manual", undefined, "tok")).success).toBe(false);
        expect((await topUpWalletAction(TENANT, 10_000_001, "manual", undefined, "tok")).success).toBe(false);
        expect(rpc).not.toHaveBeenCalled();
    });
});
