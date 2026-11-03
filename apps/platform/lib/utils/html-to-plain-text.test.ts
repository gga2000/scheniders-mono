import { describe, expect, it } from "vitest";
import { htmlToPlainText } from "./html-to-plain-text";

describe("htmlToPlainText", () => {
    it("keeps paragraphs and line breaks on their own lines", () => {
        expect(htmlToPlainText("<p>Long  lasting</p><p>100 ml<br>Eau de parfum</p>")).toBe("Long lasting\n100 ml\nEau de parfum");
    });

    it("decodes the common entities and drops tags", () => {
        expect(htmlToPlainText("<strong>A&amp;B</strong>&nbsp;&lt;3&gt;")).toBe("A&B <3>");
    });
});
