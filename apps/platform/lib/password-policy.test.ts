import { describe, expect, it } from "vitest";
import { passwordIsWeak, passwordLongEnough, passwordStrength, passwordTips, weakPasswordReason } from "./password-policy";

describe("passwordLongEnough", () => {
    it("needs 8 characters, and nothing else", () => {
        expect(passwordLongEnough("abc1234")).toBe(false);
        expect(passwordLongEnough("abcdefgh")).toBe(true);
        expect(passwordLongEnough("12345678")).toBe(true);
        expect(passwordLongEnough("كلمةسرحلوة")).toBe(true);
    });
});

describe("passwordStrength", () => {
    it("scores length, mixed case, digits and symbols", () => {
        expect(passwordStrength("")).toBe(0);
        expect(passwordStrength("abcd1234")).toBe(2);
        expect(passwordStrength("Abcd1234")).toBe(3);
        expect(passwordStrength("Abcd1234!")).toBe(4);
        expect(passwordStrength("Abcd1234!xyz")).toBe(5);
    });
});

describe("passwordIsWeak", () => {
    it("calls the meter's two lowest levels weak, and accepts them all the same", () => {
        expect(passwordIsWeak("layla2024")).toBe(true);
        expect(passwordIsWeak("07802301677")).toBe(true);
        expect(passwordIsWeak("alinasser")).toBe(true);
        expect(passwordIsWeak("Layla2024")).toBe(false);
        expect(passwordIsWeak("layla2024shop")).toBe(false);
    });
});

describe("passwordTips", () => {
    it("names only what is still missing", () => {
        expect(passwordTips("abcd1234")).toEqual(["longer", "mixedCase", "symbol"]);
        expect(passwordTips("abcdefgh")).toEqual(["longer", "mixedCase", "digit", "symbol"]);
        expect(passwordTips("Abcd1234!")).toEqual(["longer"]);
        expect(passwordTips("Abcd1234!xyz")).toEqual([]);
    });
});

describe("weakPasswordReason", () => {
    it("tells a leaked password from one short of a rule", () => {
        expect(weakPasswordReason(["pwned"])).toBe("leaked");
        expect(weakPasswordReason(["length", "pwned"])).toBe("leaked");
        expect(weakPasswordReason(["characters"])).toBe("characters");
        expect(weakPasswordReason(["length"])).toBe("length");
        expect(weakPasswordReason(undefined)).toBe("length");
    });
});
