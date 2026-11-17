import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * Team > Commissions said "No commission configurations set up yet." when
 * the settings' read failed, so live settings looked missing.
 */

let read: Record<string, unknown>;
vi.mock("@/hooks/use-admin-commissions", () => ({ useCommissionConfigs: () => read }));

const { TeamCommissionDashboard } = await import("./team-commission-dashboard");
const render = () => renderToStaticMarkup(createElement(TeamCommissionDashboard, { employees: [] }));

beforeEach(() => {
  read = { data: [], isLoading: false, isError: false, error: null, refetch: vi.fn(), isFetching: false };
});

describe("commission settings", () => {
  it("say none are set up when the read answered with none", () => {
    expect(render()).toContain("No commission configurations set up yet.");
  });

  it("say they could not load when the read failed", () => {
    read = { ...read, data: undefined, isError: true, error: new Error("500") };
    const html = render();
    expect(html).toContain("Could not load the commission settings.");
    expect(html).not.toContain("No commission configurations set up yet.");
  });
});
