/// <reference types="vitest/globals" />
// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CodRiskChip } from "./cod-risk-chip";

afterEach(cleanup);

describe("CodRiskChip", () => {
    it("names the first COD-risk reason on a card and counts the rest", () => {
        render(
            <CodRiskChip
                variant="card"
                needsAttention
                attentionReasons={["whatsapp_failed", "duplicate_order", "address_incomplete"]}
            />,
        );
        const chip = screen.getByTestId("cod-risk-chip");
        expect(chip.textContent).toContain("طلب مكرر خلال ٢٤ ساعة");
        expect(chip.textContent).toContain("+1");
        expect(chip.getAttribute("title")).toBe("طلب مكرر خلال ٢٤ ساعة · العنوان ناقص");
    });

    it("is a compact marker in a table row, with every reason in the tooltip", () => {
        render(<CodRiskChip variant="row" needsAttention attentionReasons={["high_risk_customer"]} />);
        const chip = screen.getByTestId("cod-risk-chip");
        expect(chip.textContent).toBe("COD");
        expect(chip.getAttribute("title")).toBe("زبون عالي الخطورة");
    });

    it("renders nothing for an order with only non-COD reasons, or none flagged", () => {
        const { container: whatsappOnly } = render(
            <CodRiskChip variant="card" needsAttention attentionReasons={["whatsapp_failed", "toString"]} />,
        );
        expect(whatsappOnly.innerHTML).toBe("");
        const { container: notFlagged } = render(
            <CodRiskChip variant="card" needsAttention={false} attentionReasons={["duplicate_order"]} />,
        );
        expect(notFlagged.innerHTML).toBe("");
        const { container: empty } = render(<CodRiskChip variant="row" needsAttention attentionReasons={null} />);
        expect(empty.innerHTML).toBe("");
    });
});
