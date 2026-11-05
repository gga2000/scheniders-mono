import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { loadShield, normalizeShieldPhone } from "./lookup";

const row = (phone: string) => ({
    phone, band: "none", score: null, confidence: null, stores: null, outcomes: null, delivered: null,
    delivered_stores: null, bad: null, sequence: null, last_bad_orders_ago: null, trend: null,
    trust: 100, trust_new: true, trust_steps: [],
});

describe("shield lookup", () => {
    beforeEach(() => rpc.mockReset());

    it("normalizes Iraqi mobiles to the 10-digit key and drops the rest", () => {
        expect(normalizeShieldPhone("0770 123 4567")).toBe("7701234567");
        expect(normalizeShieldPhone("+9647701234567")).toBe("7701234567");
        expect(normalizeShieldPhone("12345")).toBeNull();
        expect(normalizeShieldPhone(null)).toBeNull();
    });

    it("sends phones asked in the same tick as one call", async () => {
        rpc.mockResolvedValue({ data: [row("7701234567"), row("7801234567")], error: null });
        const [a, b, c] = await Promise.all([loadShield("7701234567"), loadShield("7801234567"), loadShield("7501234567")]);
        expect(rpc).toHaveBeenCalledTimes(1);
        expect(rpc.mock.calls[0][1]).toEqual({ p_phones: ["7701234567", "7801234567", "7501234567"] });
        expect(a?.phone).toBe("7701234567");
        expect(b?.band).toBe("none");
        expect(c).toBeNull();
    });

    it("rejects every waiter when the server refuses", async () => {
        rpc.mockResolvedValue({ data: null, error: { message: "not a member" } });
        await expect(loadShield("7701234567")).rejects.toEqual({ message: "not a member" });
    });
});
