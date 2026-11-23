import { describe, expect, it } from "vitest";
import { PrimeReadError, primeReadError, retryPrimeRead } from "./read-error";

const answer = (status: number, body: unknown) => new Response(body === undefined ? "oops" : JSON.stringify(body), { status });

describe("primeReadError", () => {
    it("keeps the reason the route gave", async () => {
        const err = await primeReadError(answer(502, { success: false, reason: "prime_rejected", message: "Prime refused the system login" }), "Prime statements");
        expect(err).toBeInstanceOf(PrimeReadError);
        expect(err.reason).toBe("prime_rejected");
        expect(err.status).toBe(502);
        expect(err.message).toBe("Prime statements failed: 502 (prime_rejected)");
    });

    it("has no reason when the answer is not the route's JSON", async () => {
        const err = await primeReadError(answer(500, undefined), "Prime tickets");
        expect(err.reason).toBeNull();
        expect(err.message).toBe("Prime tickets failed: 500");
    });
});

describe("retryPrimeRead", () => {
    it("does not ask again once Prime has refused", () => {
        expect(retryPrimeRead(0, new PrimeReadError("prime_rejected", 502, "x"))).toBe(false);
    });

    it("asks a silent Prime, or after our own failure, up to two more times", () => {
        const silent = new PrimeReadError("prime_unreachable", 502, "x");
        expect(retryPrimeRead(0, silent)).toBe(true);
        expect(retryPrimeRead(1, silent)).toBe(true);
        expect(retryPrimeRead(2, silent)).toBe(false);
        expect(retryPrimeRead(0, new Error("network"))).toBe(true);
    });
});
