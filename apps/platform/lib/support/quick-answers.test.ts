import { describe, expect, it } from "vitest";
import { foldText, matchQuickAnswers, QUICK_ANSWERS } from "./quick-answers";

const ids = (draft: string) => matchQuickAnswers(draft).map((qa) => qa.id);

describe("foldText", () => {
    it("lets different spellings of the same Arabic word meet", () => {
        expect(foldText("أضافة")).toBe(foldText("اضافه"));
        expect(foldText("مُنتَج")).toBe("منتج");
        expect(foldText("  Top   UP ")).toBe("top up");
    });
});

describe("matchQuickAnswers", () => {
    it("finds the answer for the way merchants write", () => {
        expect(ids("شلون اشحن المحفظة")[0]).toBe("wallet_topup");
        expect(ids("ليش انخصم رصيدي")[0]).toBe("wallet_charges");
        expect(ids("أريد أضيف منتج جديد")[0]).toBe("add_product");
        expect(ids("كيف اطبع الملصقات")[0]).toBe("print_labels");
        expect(ids("زبون مزعج اريد احظره")[0]).toBe("blacklist");
        expect(ids("how do I add a staff member")[0]).toBe("team");
    });

    it("shows nothing for a letter or for words it has no answer to", () => {
        expect(ids("ش")).toEqual([]);
        expect(ids("مرحبا")).toEqual([]);
    });

    it("never offers more than three", () => {
        expect(matchQuickAnswers("طلب منتج متجر طباعه محفظه موظف").length).toBeLessThanOrEqual(3);
    });

    it("keeps its search words folded, so a typed word can always meet them", () => {
        for (const qa of QUICK_ANSWERS) {
            for (const word of qa.words) expect(foldText(word)).toBe(word);
        }
    });

    it("sends every answer to a page inside the app", () => {
        for (const qa of QUICK_ANSWERS) expect(qa.href.startsWith("/")).toBe(true);
    });
});
