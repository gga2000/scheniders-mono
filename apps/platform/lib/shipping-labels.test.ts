import { describe, expect, it } from "vitest";
import { runFileNames, shippingLabelsDocument } from "@/lib/shipping-labels";
import { SETTINGS_SAMPLE_ORDER } from "@/lib/settings-sample-order";

describe("runFileNames", () => {
    it("names both files of a run in Arabic, dated by the Baghdad day", () => {
        // 22:30 UTC on 31 Oct is already 1 Nov in Baghdad.
        const names = runFileNames(44, new Date("2026-10-31T22:30:00Z"));
        expect(names.labels).toBe("ملصقات الشحن - 44 طلب - 2026-11-01.pdf");
        expect(names.prime).toBe("ملف برايم - 44 طلب - 2026-11-01.xlsx");
    });
});

describe("shippingLabelsDocument", () => {
    const brand = { primeLogo: false, shopLogo: null, fragileWarning: false, noOpen: null, customerNote: "" };
    const PNG = "data:image/png;base64,iVBORw0KGgo=";

    it("puts the shop logo in the stylesheet once and marks every label for it", () => {
        const html = shippingLabelsDocument([SETTINGS_SAMPLE_ORDER, SETTINGS_SAMPLE_ORDER], { ...brand, shopLogo: PNG });
        expect(html.split(PNG)).toHaveLength(2);
        expect(html.match(/class="dl-shop"/g)).toHaveLength(2);
    });

    // The logo is written into a CSS string and the PDF server fetches no URLs:
    // only a plain base64 image gets in.
    it("leaves out a logo that is not a plain base64 image", () => {
        for (const bad of ["https://example.com/logo.png", 'data:image/png;base64,AAA"); } body { display: none', "data:image/svg+xml;base64,PHN2Zz4="]) {
            const html = shippingLabelsDocument([SETTINGS_SAMPLE_ORDER], { ...brand, shopLogo: bad });
            expect(html).not.toContain(bad);
            expect(html).not.toContain('class="dl-shop"');
        }
    });
});
