import { describe, it, expect } from "vitest";
import { isSystemActor } from "./order-format-utils";

describe("isSystemActor", () => {
    it("treats the column default as the system placeholder, however it is cased or padded", () => {
        expect(isSystemActor("System")).toBe(true);
        expect(isSystemActor(" system ")).toBe(true);
    });

    it("does not treat a person, the bot or an empty value as the system", () => {
        expect(isSystemActor("Mohammed")).toBe(false);
        expect(isSystemActor("WhatsApp Bot")).toBe(false);
        expect(isSystemActor("")).toBe(false);
        expect(isSystemActor(null)).toBe(false);
        expect(isSystemActor(undefined)).toBe(false);
    });
});
