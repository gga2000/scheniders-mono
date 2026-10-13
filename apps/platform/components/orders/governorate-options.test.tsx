// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup } from "@testing-library/react";
import { GovernorateOptions } from "./governorate-options";
import { getGovernorateSelectOptions } from "@/lib/address-validator";

afterEach(cleanup);

describe("getGovernorateSelectOptions", () => {
    const options = getGovernorateSelectOptions();

    it("lists all 18 governorates, numbered, with capitals in parentheses", () => {
        expect(options).toHaveLength(18);
        expect(options.slice(0, 7).map((o) => o.label)).toEqual([
            "1. بغداد",
            "2. ذي قار (الناصرية)",
            "3. ديالى (بعقوبة)",
            "4. واسط (الكوت)",
            "5. كربلاء",
            "6. دهوك",
            "7. بابل (الحلة)",
        ]);
        expect(options[17].label).toBe("18. ميسان (العمارة)");
    });

    it("submits the bare Arabic name, as orders.city stores it", () => {
        expect(options[1].value).toBe("ذي قار");
        expect(new Set(options.map((o) => o.code)).size).toBe(18);
    });
});

describe("GovernorateOptions", () => {
    it("renders exactly the shared option list", () => {
        const { container } = render(<select><GovernorateOptions /></select>);
        const rendered = Array.from(container.querySelectorAll("option")).map((o) => [o.value, o.textContent]);
        expect(rendered).toEqual(getGovernorateSelectOptions().map((o) => [o.value, o.label]));
    });
});

describe("new-order and edit-order modals share one governorate list", () => {
    // Rendering either modal needs auth/query providers; the drift we guard against is
    // a modal going back to its own inline `.map` of governorates, which is visible in source.
    const files = ["create-order-modal.tsx", "order-customer-card.tsx"];

    it.each(files)("%s renders <GovernorateOptions /> for the city select", (file) => {
        const source = readFileSync(path.join(__dirname, file), "utf8");
        expect(source).toContain("<GovernorateOptions />");
        expect(source).not.toMatch(/governorates\.map\(\(gov, index\)/);
        expect(source).not.toMatch(/value=\{gov\.nameAr\}/);
    });
});
