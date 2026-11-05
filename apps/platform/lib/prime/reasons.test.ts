import { describe, expect, it } from "vitest";
import { primeReasonLabel } from "./reasons";

describe("primeReasonLabel", () => {
    it("gives Prime's words for its codes", () => {
        expect(primeReasonLabel("CLS")).toBe("الهاتف مغلق");
        expect(primeReasonLabel(" NO_ANSWER ")).toBe("لم يرد");
    });

    it("keeps text Prime sent that is not a code", () => {
        expect(primeReasonLabel("الزبون مسافر")).toBe("الزبون مسافر");
        expect(primeReasonLabel("NEW_CODE")).toBe("NEW_CODE");
    });
});
