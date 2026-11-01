// @vitest-environment jsdom
// The total names the limit the raw total hit, in the help's word: "capped at 100".
// A raw total inside 0–100 is only rounded, so it gets no note.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        language: "en",
        t: (key: string, vars?: Record<string, string | number>) => (vars && "raw" in vars ? `${key}:${vars.raw}` : key),
    }),
}));

import { ScoreTotalRow } from "./score-total-row";

afterEach(cleanup);

describe("ScoreTotalRow", () => {
    it("says a raw total over 100 is capped", () => {
        render(<ScoreTotalRow score={100} raw={126} />);
        expect(screen.getByText("customers.scoreBreakdown.capped:126")).toBeTruthy();
    });

    it("says a raw total under 0 stops at 0", () => {
        render(<ScoreTotalRow score={0} raw={-12} size="sm" />);
        expect(screen.getByText("customers.scoreBreakdown.floored:-12")).toBeTruthy();
    });

    it("adds no note when the raw total is only rounded", () => {
        const { container } = render(<ScoreTotalRow score={90} raw={89.6} />);
        expect(container.textContent).not.toMatch(/capped|floored/);
    });
});
