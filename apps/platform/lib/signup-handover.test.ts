import { describe, expect, it } from "vitest";
import { readSignupHandover } from "./signup-handover";

describe("readSignupHandover", () => {
    it("reads what usefermi.com's sign-up sheet hands over", () => {
        expect(
            readSignupHandover({
                type: "هدايا وألعاب",
                sells: "toys",
                name: " العاب السدرة ",
                slug: "alaab-alsdra",
                phone: "07802301677",
            }),
        ).toEqual({ name: "العاب السدرة", phone: "07802301677", slug: "alaab-alsdra", sells: ["toys"] });
    });

    it("opens empty without a hand-over", () => {
        expect(readSignupHandover({})).toEqual({ name: "", phone: "", slug: null, sells: [] });
    });

    it("writes the phone the way the form does and drops one that is not an Iraqi mobile", () => {
        expect(readSignupHandover({ phone: "+964 780 230 1677" }).phone).toBe("07802301677");
        expect(readSignupHandover({ phone: "12345" }).phone).toBe("");
    });

    it("keeps known answers to «شنو تبيع؟» once each, in order", () => {
        expect(readSignupHandover({ sells: "perfume, clothing,perfume,rockets" }).sells).toEqual(["perfume", "clothing"]);
    });

    it("takes the first value of a repeated parameter", () => {
        expect(readSignupHandover({ name: ["الأول", "الثاني"] }).name).toBe("الأول");
    });

    it("caps the name at the length the sign-up accepts", () => {
        expect(readSignupHandover({ name: "م".repeat(200) }).name).toHaveLength(120);
    });
});
