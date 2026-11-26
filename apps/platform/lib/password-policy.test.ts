import { describe, expect, it } from "vitest";
import { passwordMeetsRules, passwordRules, passwordStrength, passwordTips, weakPasswordReason } from "./password-policy";

describe("passwordRules", () => {
    it("needs 8 characters", () => {
        expect(passwordRules("abc1234").longEnough).toBe(false);
        expect(passwordRules("abcd1234").longEnough).toBe(true);
    });

    it("needs a Latin letter and a digit, as Supabase checks them", () => {
        expect(passwordRules("12345678").lettersAndDigits).toBe(false);
        expect(passwordRules("abcdefgh").lettersAndDigits).toBe(false);
        expect(passwordRules("كلمةسر1234").lettersAndDigits).toBe(false);
        expect(passwordRules("abcd1234").lettersAndDigits).toBe(true);
    });

    it("passes only when every rule passes", () => {
        expect(passwordMeetsRules("abc123")).toBe(false);
        expect(passwordMeetsRules("abcdefghij")).toBe(false);
        expect(passwordMeetsRules("abcd1234")).toBe(true);
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

describe("passwordTips", () => {
    it("names only what is still missing", () => {
        expect(passwordTips("abcd1234")).toEqual(["longer", "mixedCase", "symbol"]);
        expect(passwordTips("Abcd1234!")).toEqual(["longer"]);
        expect(passwordTips("Abcd1234!xyz")).toEqual([]);
    });
});

describe("weakPasswordReason", () => {
    it("tells a leaked password from one short of the rules", () => {
        expect(weakPasswordReason(["pwned"])).toBe("leaked");
        expect(weakPasswordReason(["length", "pwned"])).toBe("leaked");
        expect(weakPasswordReason(["characters"])).toBe("rules");
        expect(weakPasswordReason(undefined)).toBe("rules");
    });
});
