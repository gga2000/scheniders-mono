import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ActivityLogEntry } from "@/lib/activity-logger";

vi.mock("@/hooks/use-language", () => ({
    useLanguage: () => ({
        language: "en",
        t: (key: string, vars?: Record<string, string | number>) =>
            vars ? `${key}:${Object.values(vars).join(",")}` : key,
    }),
}));

import { ActivityTimeline } from "./activity-timeline";

afterEach(cleanup);

function entry(over: Partial<ActivityLogEntry> & { id: string }): ActivityLogEntry {
    return {
        user_id: "u1",
        user_email: "moh@perfumes.com",
        action: "order.status_change",
        entity_type: "order",
        entity_id: null,
        details: {},
        ip_address: null,
        user_agent: null,
        created_at: new Date().toISOString(),
        ...over,
    };
}

describe("ActivityTimeline", () => {
    it("names the actor through resolveName and translates order statuses", () => {
        render(
            <ActivityTimeline
                activities={[entry({ id: "a", details: { order_id: "7638", from_status: "confirmed", to_status: "cancelled", reason: "ألغى العميل" } })]}
                resolveName={() => "محمد كريم"}
            />,
        );
        expect(screen.getByText("محمد كريم")).toBeTruthy();
        expect(screen.queryByText("moh")).toBeNull();
        expect(screen.getByText("orders.status.confirmed")).toBeTruthy();
        expect(screen.getByText("orders.status.cancelled")).toBeTruthy();
        expect(screen.getByText("ألغى العميل")).toBeTruthy();
        expect(screen.getByText("#7638")).toBeTruthy();
    });

    it("falls back to the email name and labels Claude tool calls", () => {
        render(<ActivityTimeline activities={[entry({ id: "b", action: "mcp.tool_call", details: { tool: "sales_summary" } })]} />);
        expect(screen.getByText("moh")).toBeTruthy();
        expect(screen.getByText("team.timeline.mcpToolCall:sales_summary")).toBeTruthy();
    });

    it("keeps an unknown status as written", () => {
        render(<ActivityTimeline activities={[entry({ id: "c", details: { from_status: "legacy_x", to_status: "new" } })]} />);
        expect(screen.getByText("legacy_x")).toBeTruthy();
        expect(screen.getByText("orders.status.new")).toBeTruthy();
    });
});
