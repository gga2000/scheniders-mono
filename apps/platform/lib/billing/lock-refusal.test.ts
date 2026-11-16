import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServiceClient: () => ({ rpc }) }));

import { billingLockRefusal, readServerBillingLock, BILLING_LOCKED_CODE } from "./lock-refusal";

const TENANT = "6d4e6d9b-eaf5-42f9-abd1-a8afee593d9d";

beforeEach(() => rpc.mockReset());

describe("billing lock on the server (Fermi A1)", () => {
    it("reads the lock with billing_lock_snapshot for the caller's own store", async () => {
        rpc.mockResolvedValue({ data: { locked: true, reason: "unpaid" }, error: null });
        expect(await readServerBillingLock(TENANT)).toEqual({ locked: true, reason: "unpaid" });
        expect(rpc).toHaveBeenCalledWith("billing_lock_snapshot", { _tenant_id: TENANT });
    });

    it("answers a locked store with 402 and says what still works", async () => {
        rpc.mockResolvedValue({ data: { locked: true, reason: "trial_ended" }, error: null });
        const res = await billingLockRefusal(TENANT);
        expect(res?.status).toBe(402);
        const body = await res?.json();
        expect(body).toMatchObject({ success: false, code: BILLING_LOCKED_CODE, reason: "trial_ended" });
        expect(body.error).toMatch(/Orders, shipping and paying still work/);
    });

    it("lets an unlocked or unknown store through", async () => {
        rpc.mockResolvedValue({ data: { locked: false, reason: null }, error: null });
        expect(await billingLockRefusal(TENANT)).toBeNull();
        rpc.mockResolvedValue({ data: null, error: null });
        expect(await billingLockRefusal(TENANT)).toBeNull();
    });

    it("fails loudly when the lock cannot be read, instead of letting a locked store through", async () => {
        rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
        await expect(billingLockRefusal(TENANT)).rejects.toThrow(/billing lock check failed/);
    });
});
