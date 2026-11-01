// @vitest-environment jsdom
// A Latin tag name ("VIP") opening the Arabic sentence must not turn it into an LTR
// paragraph: the note takes the UI language's direction on its own element, the
// name is an isolated run, and the text stays left-set beside its icon.

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { RatingClashNote } from "./rating-clash-note";

afterEach(() => { cleanup(); localStorage.clear(); });

function renderNote(language: "ar" | "en", name: string) {
    localStorage.setItem("schneiders_language", language);
    return render(<LanguageProvider><RatingClashNote name={name} /></LanguageProvider>);
}

describe("RatingClashNote", () => {
    it("runs right to left in Arabic, left-set, with the Latin name isolated", () => {
        const { container } = renderNote("ar", "VIP");
        const note = container.firstElementChild as HTMLElement;
        expect(note.getAttribute("dir")).toBe("rtl");
        expect(note.className).toContain("text-left");
        expect(note.textContent).toBe("«VIP» هو أيضاً تقييم للعميل. هذا الوسم لا يغيّر التقييم ولا العرض المحفوظ.");
        const name = note.querySelector("span") as HTMLElement;
        expect(name.textContent).toBe("VIP");
        expect(name.className).toContain("[unicode-bidi:isolate]");
        expect(document.documentElement.getAttribute("dir")).toBeNull();
    });

    it("runs left to right in English", () => {
        const { container } = renderNote("en", "Good");
        const note = container.firstElementChild as HTMLElement;
        expect(note.getAttribute("dir")).toBe("ltr");
        expect(note.textContent).toBe("“Good” is also a customer rating. This tag won't change the rating or its saved view.");
    });
});
