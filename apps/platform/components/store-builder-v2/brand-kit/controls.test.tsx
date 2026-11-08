// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ARABIC_GOOGLE_FONTS, FontCombo } from "./controls";

afterEach(() => cleanup());

describe("FontCombo", () => {
    it("shows the saved font even when the list does not carry it", () => {
        render(<FontCombo value="IBM Plex Sans Arabic" onChange={() => {}} testId="font" />);
        const select = screen.getByTestId("font") as HTMLSelectElement;
        expect(select.value).toBe("IBM Plex Sans Arabic");
        expect(select.selectedOptions[0]?.textContent).toBe("IBM Plex Sans Arabic");
    });

    it("lists a catalogue font once", () => {
        render(<FontCombo value="Inter" onChange={() => {}} testId="font" />);
        const select = screen.getByTestId("font") as HTMLSelectElement;
        expect(Array.from(select.options).filter((o) => o.value === "Inter")).toHaveLength(1);
    });

    it("offers Readex Pro for Arabic headings", () => {
        expect(ARABIC_GOOGLE_FONTS).toContain("Readex Pro");
    });
});
