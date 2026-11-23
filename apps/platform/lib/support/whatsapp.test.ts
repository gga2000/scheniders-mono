import { describe, expect, it } from "vitest";
import { supportWhatsAppLink } from "./whatsapp";

const text = (link: string | null) => (link === null ? null : decodeURIComponent(new URL(link).searchParams.get("text") ?? ""));

describe("supportWhatsAppLink", () => {
    it("opens our number in international form, naming the shop and its number", () => {
        const link = supportWhatsAppLink("9647746128551", { name: "متجر نور", displayId: 100123 });
        expect(link?.startsWith("https://wa.me/9647746128551?text=")).toBe(true);
        expect(text(link)).toBe("هلا، أنا من متجر «متجر نور» رقم 100123.");
    });

    it.each(["07746128551", "+964 774 612 8551", "00964-774-612-8551"])("reads %s as the same number", (raw) => {
        expect(supportWhatsAppLink(raw, { name: "A", displayId: 1 })?.startsWith("https://wa.me/9647746128551?")).toBe(true);
    });

    it("still opens a chat for a shop with no name yet", () => {
        expect(text(supportWhatsAppLink("07746128551", { name: "  ", displayId: null }))).toBe("هلا، أحتاج مساعدة.");
    });

    it.each([null, undefined, "", "12345", "0770123"])("shows no button without a valid Iraqi mobile (%s)", (raw) => {
        expect(supportWhatsAppLink(raw, { name: "A", displayId: 1 })).toBeNull();
    });
});
