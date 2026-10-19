/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HighlightedPhone } from "./highlighted-phone";
import { formatPhoneGrouped } from "@/lib/order-utils";

afterEach(cleanup);

describe("formatPhoneGrouped", () => {
    it("groups a local Iraqi number 4-3-4", () => {
        expect(formatPhoneGrouped("07801234567")).toBe("0780 123 4567");
    });

    it("strips the country code before grouping", () => {
        expect(formatPhoneGrouped("+9647801234567")).toBe("0780 123 4567");
        expect(formatPhoneGrouped("9647801234567")).toBe("0780 123 4567");
    });

    it("converts Arabic-Indic digits", () => {
        expect(formatPhoneGrouped("٠٧٨٠١٢٣٤٥٦٧")).toBe("0780 123 4567");
    });

    it("leaves non-standard lengths ungrouped", () => {
        expect(formatPhoneGrouped("0780123")).toBe("0780123");
        expect(formatPhoneGrouped("")).toBe("");
        expect(formatPhoneGrouped(null)).toBe("");
    });
});

describe("HighlightedPhone", () => {
    it("renders the grouped number", () => {
        render(<HighlightedPhone phone="07801234567" query="" />);
        expect(screen.getByText("0780 123 4567")).toBeTruthy();
    });

    it("highlights a query that spans a group boundary", () => {
        const { container } = render(<HighlightedPhone phone="07801234567" query="780123" />);
        const mark = container.querySelector("mark");
        expect(mark?.textContent).toBe("780 123");
    });

    it("highlights a full number typed without the leading zero", () => {
        const { container } = render(<HighlightedPhone phone="07801234567" query="7801234567" />);
        expect(container.querySelector("mark")?.textContent).toBe("780 123 4567");
    });

    it("highlights a full number typed with the leading zero", () => {
        const { container } = render(<HighlightedPhone phone="07801234567" query="07801234567" />);
        expect(container.querySelector("mark")?.textContent).toBe("0780 123 4567");
    });

    it("does not highlight when the digits do not match", () => {
        const { container } = render(<HighlightedPhone phone="07801234567" query="0555" />);
        expect(container.querySelector("mark")).toBeNull();
    });

    it("does not highlight for a non-numeric query", () => {
        const { container } = render(<HighlightedPhone phone="07801234567" query="علي" />);
        expect(container.querySelector("mark")).toBeNull();
    });
});
