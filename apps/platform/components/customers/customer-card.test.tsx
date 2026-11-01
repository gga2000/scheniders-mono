// @vitest-environment jsdom
// A caution card is too narrow at 1280 for the value word beside "Needs confirming" and
// the "+N", so the value pill shows its icon alone there. Only then does it carry a
// tooltip with the tier's name: a pill that shows its word needs none.

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { PaginatedCustomer } from "@/hooks/use-paginated-customers";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({ t: (key: string) => key, language: "en" }),
}));
vi.mock("@/hooks/use-permission", () => ({ usePermission: () => ({ can: () => false }) }));
vi.mock("@/components/customers/customer-quick-actions", () => ({ CustomerQuickActions: () => null }));

import { CustomerCard } from "./customer-card";

afterEach(cleanup);

const customer = (over: Partial<PaginatedCustomer>): PaginatedCustomer => ({
    phone: "07511234567", name: "Dilan", has_name: true, city: null, governorate: "SU",
    total_orders: 3, total_spent: 190000, last_order_date: new Date().toISOString(), first_order_date: new Date().toISOString(),
    calculated_status: "regular", is_blacklisted: false, total_items: 3, trust_score: 70, trust_tier: "silver",
    delivery_success_rate: 67, community_avg_rating: 0, cancelled_count: 0, no_response_count: 1, rejected_count: 0,
    returned_count: 0, refund_count: 0, completed_count: 2, value_tier: "good", risk_level: "caution",
    severe_count: 0, recent_severe_count: 0, moderate_count: 1, recent_moderate_count: 1,
    ...over,
});

describe("CustomerCard value pill on a caution card", () => {
    it("hides the word only on a narrow card, and names the tier in a tooltip shown only then", () => {
        render(<CustomerCard customer={customer({})} />);
        const word = screen.getAllByText("customers.tier.good").find((e) => e.closest("[role=tooltip]") === null);
        expect(word?.className).toContain("@max-[16rem]:sr-only");
        const tip = screen.getAllByRole("tooltip", { hidden: true }).find((e) => e.textContent === "customers.tier.good");
        expect(tip).toBeDefined();
        // The same breakpoint the word uses, the other way round.
        expect(tip?.className).toContain("@min-[16rem]:hidden");
    });

    it("keeps the word and adds no tooltip when the risk is not caution", () => {
        render(<CustomerCard customer={customer({ risk_level: "clean", no_response_count: 0, moderate_count: 0, recent_moderate_count: 0 })} />);
        expect(screen.getByText("customers.tier.good").className).not.toContain("sr-only");
        expect(screen.queryAllByRole("tooltip", { hidden: true }).filter((e) => e.textContent === "customers.tier.good")).toHaveLength(0);
    });
});
