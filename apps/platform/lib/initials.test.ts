import { describe, expect, it } from "vitest";
import { initialsOf } from "./initials";

describe("initialsOf", () => {
    it("tells apart Arabic names that share a first word", () => {
        expect(initialsOf("عطور رجالية")).toBe("عر");
        expect(initialsOf("عطور نسائية")).toBe("عن");
    });
    it("drops the Arabic article", () => {
        expect(initialsOf("الرافدين للتغليف")).toBe("رل");
        expect(initialsOf("العطور")).toBe("عط");
    });
    it("handles single words, Latin names and blanks", () => {
        expect(initialsOf("boxes")).toBe("BO");
        expect(initialsOf("Glass Bottle Co")).toBe("GB");
        expect(initialsOf("   ")).toBe("?");
    });
});
