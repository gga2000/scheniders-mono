import { describe, it, expect } from "vitest";
import { leadConvertedLockResponse } from "./lead-converted-lock";

describe("leadConvertedLockResponse", () => {
    it("turns the database lock into a 409", async () => {
        const res = leadConvertedLockResponse({ message: "locked", hint: "LEAD_CONVERTED_LOCKED" });
        expect(res?.status).toBe(409);
        expect((await res?.json())?.error).toMatch(/already a store/);
    });

    it("leaves every other error alone", () => {
        expect(leadConvertedLockResponse({ message: "boom", hint: "something else" })).toBeNull();
        expect(leadConvertedLockResponse(new Error("boom"))).toBeNull();
        expect(leadConvertedLockResponse(null)).toBeNull();
    });
});
