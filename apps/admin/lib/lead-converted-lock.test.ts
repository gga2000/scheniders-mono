import { describe, it, expect } from "vitest";
import {
    convertedLeadsDeleteMessage,
    convertedLeadsMessage,
    leadConvertedLockResponse,
    prospectStoreLeadsMessage,
} from "./lead-converted-lock";

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

describe("convertedLeadsMessage", () => {
    it("names the ticked stores, so the person knows which to untick", () => {
        expect(convertedLeadsMessage(["Kawkab"])).toBe(
            '"Kawkab" is already a store, so its owner and status can\'t change. Untick it and try again.',
        );
        expect(convertedLeadsMessage(["Kawkab", "Noor"])).toBe(
            '"Kawkab" and "Noor" are already stores, so their owner and status can\'t change. Untick them and try again.',
        );
        expect(convertedLeadsMessage(["A", "B", "C", "D", "E"])).toMatch(/^"A", "B", "C" and 2 more are already stores/);
    });

    it("still refuses clearly when no name could be read", () => {
        expect(convertedLeadsMessage([])).toMatch(/already a store.*Nothing was changed/);
    });
});

describe("prospectStoreLeadsMessage", () => {
    it("says why a lead with a prospect store is not deleted, and in the bulk bar which to untick", () => {
        expect(prospectStoreLeadsMessage(["Kawkab"])).toBe(
            '"Kawkab" has a prospect store, so it can\'t be deleted. The store would stay online with no lead to find it by.',
        );
        expect(prospectStoreLeadsMessage(["Kawkab", "Noor"], true)).toBe(
            '"Kawkab" and "Noor" have prospect stores, so they can\'t be deleted. Untick them and try again. Nothing was deleted.',
        );
    });
});

describe("convertedLeadsDeleteMessage", () => {
    it("says why a lead that became a shop is not deleted, and in the bulk bar which to untick", () => {
        expect(convertedLeadsDeleteMessage(["Kawkab"])).toBe(
            '"Kawkab" is already a store, so it can\'t be deleted. Its sale and commission stay on record.',
        );
        expect(convertedLeadsDeleteMessage(["Kawkab", "Noor"], true)).toBe(
            '"Kawkab" and "Noor" are already stores, so they can\'t be deleted. Their sales and commission stay on record. Untick them and try again. Nothing was deleted.',
        );
        expect(convertedLeadsDeleteMessage(["A", "B", "C", "D"], true)).toMatch(/^"A", "B", "C" and 1 more are already stores/);
    });
});
