import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LanguageProvider } from "@/components/providers/language-provider";
import { DangerSlider } from "./shield-danger-toggle";
import type { DangerBand } from "@/lib/shield/danger";

afterEach(cleanup);

function renderSlider(band: DangerBand | null, counts: Record<DangerBand, number> | null) {
    localStorage.setItem("schneiders_language", "en");
    const onChange = vi.fn();
    render(
        <LanguageProvider>
            <DangerSlider band={band} counts={counts} onChange={onChange} />
        </LanguageProvider>,
    );
    return onChange;
}

describe("DangerSlider", () => {
    it("has exactly three stops, high to low", () => {
        renderSlider(null, { red: 1, yellow: 2, green: 3 });
        expect(screen.getAllByRole("radio").map((r) => r.getAttribute("aria-label"))).toEqual([
            "High danger (1)",
            "Medium danger (2)",
            "Low danger (3)",
        ]);
    });

    it("picks a stop, and picking it again shows every order", () => {
        const onChange = renderSlider(null, { red: 1, yellow: 2, green: 3 });
        fireEvent.click(screen.getByRole("radio", { name: "High danger (1)" }));
        expect(onChange).toHaveBeenLastCalledWith("red");
        cleanup();
        const again = renderSlider("red", { red: 1, yellow: 2, green: 3 });
        fireEvent.click(screen.getByRole("radio", { name: "High danger (1)" }));
        expect(again).toHaveBeenLastCalledWith(null);
    });

    it("can't pick a stop with no orders, so the list never goes empty", () => {
        const onChange = renderSlider(null, { red: 0, yellow: 2, green: 3 });
        const high = screen.getByRole("radio", { name: "High danger (0)" });
        expect((high as HTMLButtonElement).disabled).toBe(true);
        fireEvent.click(high);
        expect(onChange).not.toHaveBeenCalled();
    });

    it("shows dashes and blocks picking while the scores load", () => {
        renderSlider(null, null);
        for (const radio of screen.getAllByRole("radio")) expect((radio as HTMLButtonElement).disabled).toBe(true);
        expect(screen.getByRole("radio", { name: "Low danger (—)" })).toBeTruthy();
    });
});
