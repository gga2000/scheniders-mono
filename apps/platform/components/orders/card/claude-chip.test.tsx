import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClaudeChip } from "./claude-chip";

describe("ClaudeChip", () => {
    it("shows for orders made through the connector", () => {
        render(<ClaudeChip createdVia="claude" />);
        expect(screen.getByText("Claude")).toBeTruthy();
    });

    it("stays out for every other order", () => {
        const { container, rerender } = render(<ClaudeChip createdVia={null} />);
        expect(container.firstChild).toBeNull();
        rerender(<ClaudeChip createdVia={undefined} />);
        expect(container.firstChild).toBeNull();
    });
});
