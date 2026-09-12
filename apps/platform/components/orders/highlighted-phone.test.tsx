/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HighlightedPhone } from "./highlighted-phone";
import { formatPhoneGrouped } from "@/lib/order-utils";

afterEach(cleanup);

describe("formatPhoneGrouped", () => {
    it("groups a local Iraqi number 4-3-4", () => {
        expect(formatPhoneGrouped("07802301677")).toBe("0780 230 1677");
    });

    it("strips the country code before grouping", () => {
        expect(formatPhoneGrouped("+9647802301677")).toBe("0780 230 1677");
        expect(formatPhoneGrouped("9647802301677")).toBe("0780 230 1677");
    });

    it("converts Arabic-Indic digits", () => {
        expect(formatPhoneGrouped("٠٧٨٠٢٣٠١٦٧٧")).toBe("0780 230 1677");
    });

    it("leaves non-standard lengths ungrouped", () => {
        expect(formatPhoneGrouped("0780230")).toBe("0780230");
        expect(formatPhoneGrouped("")).toBe("");
        expect(formatPhoneGrouped(null)).toBe("");
    });
});

describe("HighlightedPhone", () => {
    it("renders the grouped number", () => {
        render(<HighlightedPhone phone="07802301677" query="" />);
        expect(screen.getByText("0780 230 1677")).toBeTruthy();
    });

    it("highlights a query that spans a group boundary", () => {
        const { container } = render(<HighlightedPhone phone="07802301677" query="780230" />);
        const mark = container.querySelector("mark");
        expect(mark?.textContent).toBe("780 230");
    });

    it("highlights a full number typed without the leading zero", () => {
        const { container } = render(<HighlightedPhone phone="07802301677" query="7802301677" />);
        expect(container.querySelector("mark")?.textContent).toBe("780 230 1677");
    });

    it("highlights a full number typed with the leading zero", () => {
        const { container } = render(<HighlightedPhone phone="07802301677" query="07802301677" />);
        expect(container.querySelector("mark")?.textContent).toBe("0780 230 1677");
    });

    it("does not highlight when the digits do not match", () => {
        const { container } = render(<HighlightedPhone phone="07802301677" query="0555" />);
        expect(container.querySelector("mark")).toBeNull();
    });

    it("does not highlight for a non-numeric query", () => {
        const { container } = render(<HighlightedPhone phone="07802301677" query="علي" />);
        expect(container.querySelector("mark")).toBeNull();
    });
});
